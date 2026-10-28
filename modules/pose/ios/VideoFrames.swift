import AVFoundation
import CoreImage
import UIKit

/// Sequential frame reader: AVAssetReader -> (optionally rotated + cropped) 32BGRA CVPixelBuffers.
/// Rotation (preferredTransform) and crop are applied with CoreImage so that MediaPipe/Vision
/// always see an upright image and landmark pixel coords refer to the *output* image.
final class VideoFrames {
  struct Info {
    let duration: Double
    let nominalFps: Double
    let width: Int    // display (upright) size of the full frame
    let height: Int
  }

  let asset: AVURLAsset
  let track: AVAssetTrack
  let info: Info
  private let reader: AVAssetReader
  private let output: AVAssetReaderTrackOutput
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private let orientation: CGImagePropertyOrientation
  private let needsTransform: Bool
  private var pool: CVPixelBufferPool?
  private var poolSize: (Int, Int) = (0, 0)
  let crop: CGRect?            // in upright pixel coords
  let outWidth: Int
  let outHeight: Int

  init(url: URL, crop normCrop: CGRect?, maxSeconds: Double) throws {
    asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let t = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "Pose", code: 1, userInfo: [NSLocalizedDescriptionKey: "no video track"]) }
    track = t
    let natural = t.naturalSize
    let xf = t.preferredTransform
    // Map preferredTransform to a CGImagePropertyOrientation (common cases).
    var o: CGImagePropertyOrientation = .up
    if xf.a == 0 && xf.b == 1 && xf.c == -1 && xf.d == 0 { o = .right }        // 90° cw (portrait from camera)
    else if xf.a == 0 && xf.b == -1 && xf.c == 1 && xf.d == 0 { o = .left }    // 90° ccw
    else if xf.a == -1 && xf.b == 0 && xf.c == 0 && xf.d == -1 { o = .down }   // 180°
    orientation = o
    needsTransform = (o != .up)
    let rotated = (o == .left || o == .right)
    let w = Int(rotated ? natural.height : natural.width)
    let h = Int(rotated ? natural.width : natural.height)
    info = Info(duration: CMTimeGetSeconds(asset.duration), nominalFps: Double(t.nominalFrameRate), width: w, height: h)

    if let nc = normCrop, !(nc.minX <= 0 && nc.minY <= 0 && nc.width >= 1 && nc.height >= 1) {
      // clamp to frame, even pixel sizes
      let x = max(0, min(Double(w), nc.minX * Double(w)))
      let y = max(0, min(Double(h), nc.minY * Double(h)))
      let cw = max(2, min(Double(w) - x, nc.width * Double(w)))
      let ch = max(2, min(Double(h) - y, nc.height * Double(h)))
      crop = CGRect(x: x.rounded(.down), y: y.rounded(.down), width: (cw / 2).rounded(.down) * 2, height: (ch / 2).rounded(.down) * 2)
      outWidth = Int(crop!.width); outHeight = Int(crop!.height)
    } else {
      crop = nil; outWidth = w; outHeight = h
    }

    reader = try AVAssetReader(asset: asset)
    output = AVAssetReaderTrackOutput(track: t, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    if maxSeconds > 0 {
      reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: maxSeconds, preferredTimescale: 600))
    }
    guard reader.startReading() else { throw reader.error ?? NSError(domain: "Pose", code: 2, userInfo: [NSLocalizedDescriptionKey: "cannot start reading"]) }
  }

  func close() { if reader.status == .reading { reader.cancelReading() } }
  deinit { close() }

  /// Returns the next frame as (presentation seconds, upright + cropped BGRA buffer), or nil at EOF.
  func next() -> (Double, CVPixelBuffer)? {
    guard let sb = output.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else { return nil }
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
    if !needsTransform && crop == nil { return (t, pb) }
    return (t, transform(pb))
  }

  func skip() -> Double? {
    guard let sb = output.copyNextSampleBuffer() else { return nil }
    return CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))
  }

  private func transform(_ pb: CVPixelBuffer) -> CVPixelBuffer {
    var img = CIImage(cvPixelBuffer: pb)
    if needsTransform { img = img.oriented(orientation) }
    // CIImage origin is bottom-left; convert top-left crop.
    if let c = crop {
      let fullH = img.extent.height
      let ciRect = CGRect(x: c.minX, y: fullH - c.maxY, width: c.width, height: c.height)
      img = img.cropped(to: ciRect).transformed(by: CGAffineTransform(translationX: -ciRect.minX, y: -ciRect.minY))
    }
    let out = makeBuffer(width: outWidth, height: outHeight)
    ciContext.render(img, to: out, bounds: CGRect(x: 0, y: 0, width: outWidth, height: outHeight), colorSpace: CGColorSpaceCreateDeviceRGB())
    return out
  }

  private func makeBuffer(width: Int, height: Int) -> CVPixelBuffer {
    if pool == nil || poolSize.0 != width || poolSize.1 != height {
      let attrs: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      ]
      var p: CVPixelBufferPool?
      CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &p)
      pool = p; poolSize = (width, height)
    }
    var out: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool!, &out)
    if out == nil {
      CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, nil, &out)
    }
    return out!
  }

  /// One upright, cropped frame as JPEG (for the debug overlay / screenshot proof).
  static func jpeg(url: URL, at seconds: Double, crop normCrop: CGRect?, maxSide: Double) throws -> (URL, Int, Int) {
    let asset = AVURLAsset(url: url)
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 60)
    gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)
    let cg = try gen.copyCGImage(at: CMTime(seconds: seconds, preferredTimescale: 600), actualTime: nil)
    var img = CIImage(cgImage: cg)
    let w = img.extent.width, h = img.extent.height
    if let nc = normCrop, !(nc.minX <= 0 && nc.minY <= 0 && nc.width >= 1 && nc.height >= 1) {
      let c = CGRect(x: nc.minX * w, y: nc.minY * h, width: nc.width * w, height: nc.height * h).intersection(CGRect(x: 0, y: 0, width: w, height: h))
      let ciRect = CGRect(x: c.minX, y: h - c.maxY, width: c.width, height: c.height)
      img = img.cropped(to: ciRect).transformed(by: CGAffineTransform(translationX: -ciRect.minX, y: -ciRect.minY))
    }
    if maxSide > 0 {
      let s = min(1, maxSide / max(img.extent.width, img.extent.height))
      if s < 1 { img = img.transformed(by: CGAffineTransform(scaleX: s, y: s)) }
    }
    let ctx = CIContext()
    guard let outCG = ctx.createCGImage(img, from: img.extent) else { throw NSError(domain: "Pose", code: 3, userInfo: [NSLocalizedDescriptionKey: "render failed"]) }
    let ui = UIImage(cgImage: outCG)
    guard let data = ui.jpegData(compressionQuality: 0.85) else { throw NSError(domain: "Pose", code: 4, userInfo: [NSLocalizedDescriptionKey: "jpeg failed"]) }
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("frame-\(Int(seconds * 1000))-\(UUID().uuidString.prefix(6)).jpg")
    try data.write(to: out)
    return (out, outCG.width, outCG.height)
  }
}
