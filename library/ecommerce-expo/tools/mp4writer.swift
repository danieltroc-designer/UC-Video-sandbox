// Encode a manifest of timestamped JPEG frames into a constant-rate H.264 MP4.
//
// Playwright's bundled ffmpeg is a VP8/WebM-only build and there is no system
// ffmpeg here, so the MP4 is written with AVFoundation (hardware encoder).
//
// The screencast frames this reads are irregular — Chrome emits one when
// something changed, so a still hold produces no frames at all. Resampling
// against each frame's own timestamp is what keeps the result in time: for
// every output frame at n/fps we draw the newest source frame at or before
// that instant, so a hold becomes held frames instead of the video running
// ahead of the deck.
//
//   swiftc -O tools/mp4writer.swift -o mp4writer && ./mp4writer manifest.json

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

struct Frame: Decodable {
    let file: String
    let t: Double
}

struct Manifest: Decodable {
    let dir: String
    let width: Int
    let height: Int
    let fps: Int
    let mbps: Int?
    let duration: Double
    let out: String
    let frames: [Frame]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("mp4writer: \(message)\n".utf8))
    exit(1)
}

// `--inspect video.mp4 outdir t...` reads the result back: there is no ffmpeg
// here that can demux MP4 or decode H.264, so verifying the export — its real
// duration, dimensions, frame rate, and how the encode looks at a given second
// — has to go through AVFoundation too.
if CommandLine.arguments.count >= 3 && CommandLine.arguments[1] == "--inspect" {
    let url = URL(fileURLWithPath: CommandLine.arguments[2])
    let asset = AVURLAsset(url: url)
    let sem = DispatchSemaphore(value: 0)
    Task {
        let dur = try await asset.load(.duration)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = tracks.first else { fail("no video track") }
        let size = try await track.load(.naturalSize)
        let rate = try await track.load(.nominalFrameRate)
        let bits = try await track.load(.estimatedDataRate)
        print(String(format: "[inspect] %.0fx%.0f  %.2fs  %.2ffps  %.1f Mbps",
                     size.width, size.height, dur.seconds, rate, bits / 1e6))

        if CommandLine.arguments.count > 4 {
            let outDir = URL(fileURLWithPath: CommandLine.arguments[3])
            try? FileManager.default.createDirectory(at: outDir,
                                                    withIntermediateDirectories: true)
            let gen = AVAssetImageGenerator(asset: asset)
            gen.appliesPreferredTrackTransform = true
            gen.requestedTimeToleranceBefore = .zero
            gen.requestedTimeToleranceAfter = .zero
            gen.maximumSize = .zero
            for arg in CommandLine.arguments.dropFirst(4) {
                guard let t = Double(arg) else { continue }
                let (image, _) = try await gen.image(at: CMTime(seconds: t,
                                                                preferredTimescale: 600))
                let dest = outDir.appendingPathComponent(String(format: "still-%05.1fs.png", t))
                guard let out = CGImageDestinationCreateWithURL(
                    dest as CFURL, "public.png" as CFString, 1, nil) else {
                    fail("cannot write \(dest.path)")
                }
                CGImageDestinationAddImage(out, image, nil)
                CGImageDestinationFinalize(out)
                print("[inspect] \(dest.lastPathComponent)  \(image.width)x\(image.height)")
            }
        }
        sem.signal()
    }
    sem.wait()
    exit(0)
}

guard CommandLine.arguments.count == 2 else { fail("usage: mp4writer manifest.json") }
let manifestURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let data = try? Data(contentsOf: manifestURL),
      let m = try? JSONDecoder().decode(Manifest.self, from: data) else {
    fail("cannot read manifest \(manifestURL.path)")
}
guard !m.frames.isEmpty else { fail("manifest has no frames") }

let outURL = URL(fileURLWithPath: m.out)
try? FileManager.default.removeItem(at: outURL)
try? FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(),
                                         withIntermediateDirectories: true)

guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else {
    fail("cannot create writer at \(outURL.path)")
}

// Flat brand graphics at 4K are cheap to encode, but the deck's small type
// and 1px rules are exactly what a starved H.264 rings around, so the target
// is deliberately high rather than tuned to the average frame. High profile
// plus a 2s keyframe interval so scrubbing in a player lands on a real frame
// rather than deep in a GOP.
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: m.width,
    AVVideoHeightKey: m.height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: (m.mbps ?? 40) * 1_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalDurationKey: 2.0,
        AVVideoAllowFrameReorderingKey: true,
    ],
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: m.width,
        kCVPixelBufferHeightKey as String: m.height,
    ])
guard writer.canAdd(input) else { fail("writer rejected the video input") }
writer.add(input)
guard writer.startWriting() else {
    fail("startWriting failed: \(writer.error?.localizedDescription ?? "unknown")")
}
writer.startSession(atSourceTime: .zero)

let dir = URL(fileURLWithPath: m.dir)
let colorSpace = CGColorSpaceCreateDeviceRGB()

func decode(_ name: String) -> CGImage? {
    let url = dir.appendingPathComponent(name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

// A queued pixel buffer belongs to the encoder, so every append needs its own.
// Duplicated frames therefore still cost a draw, but not a JPEG decode — the
// decoded image is held until the source frame changes.
func buffer(from image: CGImage) -> CVPixelBuffer? {
    guard let pool = adaptor.pixelBufferPool else { return nil }
    var out: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess,
          let pb = out else { return nil }
    CVPixelBufferLockBaseAddress(pb, [])
    defer { CVPixelBufferUnlockBaseAddress(pb, []) }
    guard let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(pb),
        width: m.width, height: m.height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
            | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: m.width, height: m.height))
    return pb
}

let fps = Int32(m.fps)
let outCount = max(1, Int((m.duration * Double(m.fps)).rounded()))
var cursor = 0
var heldIndex = -1
var held: CGImage?
var written = 0

for n in 0..<outCount {
    let t = Double(n) / Double(m.fps)
    while cursor + 1 < m.frames.count && m.frames[cursor + 1].t <= t { cursor += 1 }

    if cursor != heldIndex {
        guard let image = decode(m.frames[cursor].file) else {
            fail("cannot decode \(m.frames[cursor].file)")
        }
        // Drawing into the output rect would quietly upscale an undersized
        // frame, which is how a 1080p capture once shipped as a 4K file.
        guard image.width == m.width && image.height == m.height else {
            fail("\(m.frames[cursor].file) is \(image.width)x\(image.height), "
                + "expected \(m.width)x\(m.height)")
        }
        held = image
        heldIndex = cursor
    }
    guard let image = held, let pb = buffer(from: image) else {
        fail("cannot build pixel buffer for frame \(n)")
    }

    while !input.isReadyForMoreMediaData { usleep(2000) }
    if !adaptor.append(pb, withPresentationTime: CMTime(value: Int64(n), timescale: fps)) {
        fail("append failed at frame \(n): "
            + (writer.error?.localizedDescription ?? "unknown"))
    }
    written += 1
    if n % 150 == 0 {
        let pct = Double(n) / Double(outCount) * 100
        print(String(format: "[encode] %5d/%d  %.0f%%", n, outCount, pct))
        fflush(stdout)
    }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()

if writer.status != .completed {
    fail("finishWriting: \(writer.error?.localizedDescription ?? "unknown")")
}
print("[encode] wrote \(written) frames at \(m.fps)fps -> \(m.out)")
