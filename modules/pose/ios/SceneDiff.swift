import AVFoundation
import CoreImage
import UIKit

/**
 Phase 13 step 2 — per-sample picture change inside the crop, for visual scene-cut detection (the TS side
 decides what is a cut, so thresholds are testable against fixtures). Reads the recording sequentially,
 keeps ≈ sampleFps frames per second, downsamples each to a small grayscale raster and reports, against the
 previous kept frame: `hist` = L1 distance of 32-bin normalised histograms (0..1) and `pix` = mean absolute
 pixel difference (0..255).
 */
enum SceneDiff {
  struct Result {
    var sampleFps: Double
    var samples: [[Double]]   // [t, hist, pix]
    var ms: Int
  }

  static func compute(url: URL, crop: CGRect?, sampleFps: Double = 10) throws -> Result {
    let t0 = CFAbsoluteTimeGetCurrent()
    let frames = try VideoFrames(url: url, crop: crop, maxSeconds: 0)
    defer { frames.close() }
    let gw = 96
    let gh = max(16, Int(Double(frames.outHeight) * Double(gw) / Double(max(1, frames.outWidth))))
    let ctx = CIContext(options: [.useSoftwareRenderer: false, .cacheIntermediates: false])
    let scale = CGFloat(gw) / CGFloat(max(1, frames.outWidth))
    let step = sampleFps > 0 ? max(1, Int((frames.info.nominalFps / sampleFps).rounded())) : 1
    var samples: [[Double]] = []
    var prev: [Float]? = nil
    var prevHist: [Float]? = nil
    var idx = 0
    while true {
      let item: (Double, CVPixelBuffer)?
      if idx % step == 0 { item = frames.next() } else { if frames.skip() == nil { break }; idx += 1; continue }
      guard let (t, pb) = item else { break }
      idx += 1
      let img = CIImage(cvPixelBuffer: pb).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      guard let cg = ctx.createCGImage(img, from: CGRect(x: 0, y: 0, width: gw, height: gh)), let g = SceneAnalysis.gray(cg, w: gw, h: gh, ctx: ctx) else { continue }
      var hist = [Float](repeating: 0, count: 32)
      for v in g { hist[min(31, Int(v) >> 3)] += 1 }
      let n = Float(g.count)
      for i in 0..<32 { hist[i] /= n }
      if let p = prev, let ph = prevHist {
        var pix: Float = 0
        for i in 0..<g.count { pix += abs(g[i] - p[i]) }
        var hd: Float = 0
        for i in 0..<32 { hd += abs(hist[i] - ph[i]) }
        samples.append([t, Double(hd / 2), Double(pix / n)])
      } else {
        samples.append([t, 0, 0])
      }
      prev = g; prevHist = hist
    }
    return Result(sampleFps: sampleFps, samples: samples, ms: Int((CFAbsoluteTimeGetCurrent() - t0) * 1000))
  }
}
