#!/usr/bin/env python3
"""Run a photo through Uploadcare's remove_bg add-on and save the real output.

Card 4 claims the AI Image Editor cleans a product shot's background. The claim
sits three metres from a booth where someone can try it, so the after-image has
to be what Uploadcare actually returns — not a cutout someone made by hand and
not a CSS treatment. This script is the provenance trail: it uploads the source,
runs the add-on, waits for the job, downloads the result, and prints both UUIDs
so the pair on screen can be traced back to a real job.

    export UPLOADCARE_PUBLIC_KEY=...      # both from the project dashboard,
    export UPLOADCARE_SECRET_KEY=...      # API keys — remove_bg needs a paid plan

    python tools/remove_bg.py photo.jpg --bg ffffff \
        --out assets/ecommerce/editor-after.png

`--bg` asks Uploadcare to composite the studio colour itself, so the delivered
PNG *is* the white-background shot. Omit it to get the add-on's default
transparent PNG, which is the honest choice if the card is going to put its own
surface behind the subject.

Docs: https://uploadcare.com/docs/remove-bg/
"""

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request
import uuid

UPLOAD = "https://upload.uploadcare.com/base/"
ADDON = "https://api.uploadcare.com/addons/remove_bg/execute/"
STATUS = ADDON + "status/"
CDN = "https://ucarecdn.com/{}/"
ACCEPT = "application/vnd.uploadcare-v0.7+json"


def _request(url, *, data=None, headers=None, method=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise SystemExit(f"{method or 'GET'} {url}\n  HTTP {e.code}: {body}") from None


def _multipart(fields, filename, blob, mime):
    """Minimal multipart body — the upload endpoint wants a real form post."""
    b = uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += (f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n'
                f"{v}\r\n").encode()
    out += (f'--{b}\r\nContent-Disposition: form-data; name="file"; '
            f'filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode()
    out += blob + b"\r\n" + f"--{b}--\r\n".encode()
    return out, f"multipart/form-data; boundary={b}"


def upload(path, pub):
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    # store=1 so the file outlives the 24h window an unstored upload gets — the
    # add-on result references it, and a booth asset should be reproducible later
    body, ctype = _multipart(
        {"UPLOADCARE_PUB_KEY": pub, "UPLOADCARE_STORE": "1"},
        path.name, path.read_bytes(), mime)
    r = json.loads(_request(UPLOAD, data=body,
                            headers={"Content-Type": ctype}, method="POST"))
    return r["file"]


def execute(target, auth, params):
    payload = {"target": target}
    if params:
        payload["params"] = params
    r = json.loads(_request(
        ADDON, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": ACCEPT,
                 "Authorization": auth}))
    return r["request_id"]


def wait(request_id, auth, timeout=180):
    """Poll until done. The add-on is asynchronous; there is no sync variant."""
    deadline = time.time() + timeout
    seen = None
    while time.time() < deadline:
        r = json.loads(_request(
            f"{STATUS}?request_id={request_id}",
            headers={"Accept": ACCEPT, "Authorization": auth}))
        status = r.get("status")
        if status != seen:
            print(f"  status: {status}")
            seen = status
        if status == "done":
            return r["result"]["file_id"]
        if status == "error" or status == "failed":
            raise SystemExit(f"add-on failed: {json.dumps(r)}")
        time.sleep(2)
    raise SystemExit(f"timed out after {timeout}s waiting for {request_id}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=pathlib.Path, help="JPG or PNG, up to 12MB")
    ap.add_argument("--out", type=pathlib.Path,
                    default=pathlib.Path("assets/ecommerce/editor-after.png"))
    ap.add_argument("--bg", metavar="HEX",
                    help="background colour Uploadcare composites, e.g. ffffff. "
                         "Omit for a transparent PNG.")
    ap.add_argument("--crop", action="store_true",
                    help="crop away empty regions (changes the canvas, so the "
                         "before/after no longer line up)")
    ap.add_argument("--shadow", action="store_true",
                    help="add the add-on's artificial contact shadow")
    a = ap.parse_args()

    pub = os.environ.get("UPLOADCARE_PUBLIC_KEY")
    sec = os.environ.get("UPLOADCARE_SECRET_KEY")
    if not (pub and sec):
        raise SystemExit("set UPLOADCARE_PUBLIC_KEY and UPLOADCARE_SECRET_KEY")
    if not a.source.exists():
        raise SystemExit(f"no such file: {a.source}")
    size = a.source.stat().st_size
    if size > 12 * 1024 * 1024:
        raise SystemExit(f"{a.source} is {size/1e6:.1f}MB; the add-on caps at 12MB")

    auth = f"Uploadcare.Simple {pub}:{sec}"
    params = {}
    if a.bg:
        params["bg_color"] = a.bg.lstrip("#")
    # keep the canvas unless asked otherwise, so before and after can be shown
    # as the same frame rather than two differently-shaped pictures
    params["crop"] = bool(a.crop)
    if a.shadow:
        params["add_shadow"] = True

    print(f"uploading {a.source} ({size/1024:.0f}KB)")
    src = upload(a.source, pub)
    print(f"  source uuid: {src}")
    print(f"  {CDN.format(src)}")

    print(f"running remove_bg  params={json.dumps(params)}")
    out_id = wait(execute(src, auth, params), auth)
    print(f"  result uuid: {out_id}")
    print(f"  {CDN.format(out_id)}")

    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_bytes(_request(CDN.format(out_id)))
    print(f"\nwrote {a.out}  ({a.out.stat().st_size/1024:.0f}KB)")
    print("\nrecord these in EVENT.md so the pair on card 4 stays traceable:")
    print(f"  before {src}\n  after  {out_id}")


if __name__ == "__main__":
    main()
