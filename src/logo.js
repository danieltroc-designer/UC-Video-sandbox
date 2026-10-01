// Splits the Uploadcare lockup SVG into animatable parts:
// the glyph (individual yellow squares) and the wordmark (one path per letter).

const WHITE = new Set(['#fff', '#ffffff', 'white']);

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y, cx: (x + r) / 2, cy: (y + btm) / 2 };
}

export async function loadLogo(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load logo (${res.status})`);
  const markup = await res.text();

  // Mount off-screen so the browser can give us exact path bounds.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  host.innerHTML = markup;
  document.body.append(host);

  const parts = [...host.querySelectorAll('path')].map((p) => {
    const b = p.getBBox();
    return {
      d: p.getAttribute('d'),
      fill: (p.getAttribute('fill') || '#fff').toLowerCase(),
      rule: p.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero',
      x: b.x, y: b.y, w: b.width, h: b.height,
    };
  });
  host.remove();

  const squares = parts
    .filter((p) => !WHITE.has(p.fill))
    .map((p) => ({ ...p, cx: p.x + p.w / 2, cy: p.y + p.h / 2, size: Math.max(p.w, p.h) }));

  const letters = parts
    .filter((p) => WHITE.has(p.fill))
    .sort((a, b) => a.x - b.x)
    .map((p) => ({ ...p, path: new Path2D(p.d) }));

  return {
    squares,
    letters,
    glyph: union(squares),
    wordmark: union(letters),
    bounds: union(parts),
  };
}
