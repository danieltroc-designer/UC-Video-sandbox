// Writes a transparent MOV of the mascot: ProRes 4444 (the editors' overlay
// standard) or HEVC with alpha (small, plays on iPhone and in Apple's apps).
// Browsers can't encode either and there's no ffmpeg here, so it goes through
// AVFoundation like library/*/tools/mp4writer.swift.
//
// The manifest holds the clip as runs of identical stills, each a list of
// solid rectangles (src/mascot.js scene()), so it stays tiny and every frame
// is drawn exactly. Built and run by render/mov.mjs:
//
//   swiftc -O render/movwriter.swift -o render/_bin/movwriter
//   movwriter manifest.json        writes manifest.out, printing "progress <n> <total>"
//   movwriter --inspect clip.mov   size, length, codec, and how much of each second is transparent

import AVFoundation
import Foundation
import VideoToolbox

struct Still: Decodable {
    let start: Int
    let end: Int
    let rects: [[Int]] // [colour, x, y, w, h]
}

struct Manifest: Decodable {
    let width: Int
    let height: Int
    let fps: Int
    let codec: String // "prores" | "hevc"
    let out: String
    let colors: [String: [Int]] // colour id -> [r, g, b]
    let stills: [Still]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("movwriter: \(message)\n".utf8))
    exit(1)
}

// A still as a BGRA pixel buffer: transparent, then each rectangle opaque.
// Alpha is only ever 0 or 255, so premultiplied or not makes no difference.
func draw(_ still: Still, _ m: Manifest, _ adaptor: AVAssetWriterInputPixelBufferAdaptor) -> CVPixelBuffer {
    var made: CVPixelBuffer?
    if let pool = adaptor.pixelBufferPool {
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &made)
    } else {
        CVPixelBufferCreate(nil, m.width, m.height, kCVPixelFormatType_32BGRA, nil, &made)
    }
    guard let buffer = made else { fail("no pixel buffer") }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    let base = CVPixelBufferGetBaseAddress(buffer)!
    memset(base, 0, rowBytes * m.height)
    let pixels = base.assumingMemoryBound(to: UInt32.self)
    let stride = rowBytes / 4
    for r in still.rects {
        let rgb = m.colors[String(r[0])] ?? [255, 255, 255]
        let bgra = UInt32(rgb[2]) | UInt32(rgb[1]) << 8 | UInt32(rgb[0]) << 16 | 0xff00_0000
        let x0 = max(0, r[1]), x1 = min(m.width, r[1] + r[3])
        let y0 = max(0, r[2]), y1 = min(m.height, r[2] + r[4])
        guard x0 < x1, y0 < y1 else { continue }
        for y in y0..<y1 { (pixels + y * stride + x0).update(repeating: bgra, count: x1 - x0) }
    }
    return buffer
}

func write(_ m: Manifest) {
    let url = URL(fileURLWithPath: m.out)
    try? FileManager.default.removeItem(at: url)
    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else { fail("cannot create \(m.out)") }
    var settings: [String: Any] = [
        AVVideoWidthKey: m.width,
        AVVideoHeightKey: m.height,
        AVVideoColorPropertiesKey: [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
    ]
    if m.codec == "hevc" {
        settings[AVVideoCodecKey] = AVVideoCodecType.hevcWithAlpha
        // Generous for flat pixel art, so edges stay clean; alpha at full quality.
        settings[AVVideoCompressionPropertiesKey] = [
            AVVideoAverageBitRateKey: max(4_000_000, m.width * m.height * m.fps / 6),
            kVTCompressionPropertyKey_TargetQualityForAlpha as String: 1.0,
        ]
    } else {
        settings[AVVideoCodecKey] = AVVideoCodecType.proRes4444
    }
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: m.width,
        kCVPixelBufferHeightKey as String: m.height,
    ])
    guard writer.canAdd(input) else { fail("this Mac can't encode \(m.codec) at \(m.width)x\(m.height)") }
    writer.add(input)
    guard writer.startWriting() else { fail(writer.error?.localizedDescription ?? "cannot start writing") }
    writer.startSession(atSourceTime: .zero)

    // Constant frame rate (editors prefer it): each still is appended once per frame it covers.
    let total = m.stills.last?.end ?? 0
    for still in m.stills {
        let buffer = draw(still, m, adaptor)
        for i in still.start..<still.end {
            while !input.isReadyForMoreMediaData { usleep(500) }
            guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(i), timescale: Int32(m.fps))) else {
                fail(writer.error?.localizedDescription ?? "could not add frame \(i)")
            }
            if (i + 1) % 6 == 0 || i + 1 == total { print("progress \(i + 1) \(total)"); fflush(stdout) }
        }
    }
    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else { fail(writer.error?.localizedDescription ?? "could not finish") }
}

// Reads the file back through AVFoundation, decoding to BGRA with alpha, and
// reports the share of fully transparent / opaque / in-between pixels at the
// middle of each second, so the export can be checked without an editor.
func inspect(_ path: String) {
    let done = DispatchSemaphore(value: 0)
    Task {
        do {
            let asset = AVURLAsset(url: URL(fileURLWithPath: path))
            let duration = try await asset.load(.duration)
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { fail("no video track") }
            let size = try await track.load(.naturalSize)
            let fps = try await track.load(.nominalFrameRate)
            let format = try await track.load(.formatDescriptions).first!
            let fourcc = CMFormatDescriptionGetMediaSubType(format)
            let codec = String((0..<4).map { Character(UnicodeScalar(UInt8((fourcc >> (24 - 8 * $0)) & 255))) })
            print(String(format: "[inspect] %.0fx%.0f  %.2fs  %.2f fps  codec %@", size.width, size.height, duration.seconds, fps, codec))

            let reader = try AVAssetReader(asset: asset)
            let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
            reader.add(output)
            reader.startReading()
            var next = 0.5
            while let sample = output.copyNextSampleBuffer() {
                let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
                guard t >= next, let image = CMSampleBufferGetImageBuffer(sample) else { continue }
                next += 1
                CVPixelBufferLockBaseAddress(image, .readOnly)
                let w = CVPixelBufferGetWidth(image), h = CVPixelBufferGetHeight(image)
                let rowBytes = CVPixelBufferGetBytesPerRow(image)
                let bytes = CVPixelBufferGetBaseAddress(image)!.assumingMemoryBound(to: UInt8.self)
                var clear = 0, solid = 0, partial = 0
                var colours: [String: Int] = [:]
                for y in Swift.stride(from: 0, to: h, by: 2) {
                    for x in Swift.stride(from: 0, to: w, by: 2) {
                        let p = y * rowBytes + x * 4
                        let a = bytes[p + 3]
                        if a == 0 { clear += 1 } else if a == 255 { solid += 1 } else { partial += 1 }
                        if a == 255 { colours[String(format: "#%02x%02x%02x", bytes[p + 2], bytes[p + 1], bytes[p]), default: 0] += 1 }
                    }
                }
                CVPixelBufferUnlockBaseAddress(image, .readOnly)
                let n = Double(clear + solid + partial)
                let top = colours.sorted { $0.value > $1.value }.prefix(2).map { "\($0.key) \(Int(Double($0.value) / Double(max(1, solid)) * 100))%" }
                print(String(format: "[inspect] %5.2fs  transparent %5.1f%%  opaque %5.1f%%  partial %4.2f%%  ",
                             t, Double(clear) / n * 100, Double(solid) / n * 100, Double(partial) / n * 100) + top.joined(separator: ", "))
            }
        } catch {
            fail(error.localizedDescription)
        }
        done.signal()
    }
    done.wait()
}

let args = CommandLine.arguments
if args.count == 3 && args[1] == "--inspect" {
    inspect(args[2])
} else if args.count == 2 {
    guard let data = FileManager.default.contents(atPath: args[1]),
          let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else { fail("cannot read manifest \(args[1])") }
    write(manifest)
} else {
    fail("usage: movwriter manifest.json | movwriter --inspect clip.mov")
}
