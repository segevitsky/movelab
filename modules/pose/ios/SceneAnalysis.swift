import AVFoundation
import CoreImage
import UIKit

/**
 Architecture §5a — scene elements, computed from the recording before it is deleted:
 - auto-crop of the moving (video) area in a screen recording: per-pixel temporal std → threshold →
   largest connected box
 - floor-mat quad: temporal median background → dark core in the lower half → flood fill bounded by
   edges → 4 corners (TL, TR, BR, BL)
 Everything runs on a small grayscale raster (≈160 px wide) so it takes well under a second.
 */
enum SceneAnalysis {
  struct Result {
    var width: Int
    var height: Int
    var cropRect: CGRect?        // normalised 0..1
    var matQuad: [CGPoint]?      // source px, TL TR BR BL
    var cameraStatic: Bool
    var samples: Int
    var ms: Int
  }

  static func analyze(url: URL, sampleFps: Double = 2, maxSamples: Int = 60) throws -> Result {
    let t0 = CFAbsoluteTimeGetCurrent()
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "Pose", code: 10, userInfo: [NSLocalizedDescriptionKey: "no video track"]) }
    let dur = CMTimeGetSeconds(asset.duration)
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 10)
    gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 10)
    let natural = track.naturalSize.applying(track.preferredTransform)
    let W = Int(abs(natural.width)), H = Int(abs(natural.height))
    let gw = 160
    let gh = max(16, Int(Double(H) * Double(gw) / Double(W)))
    gen.maximumSize = CGSize(width: gw, height: gh)

    // sample grayscale rasters
    var rasters: [[Float]] = []
    let n = max(2, min(maxSamples, Int(dur * sampleFps)))
    let ctx = CIContext(options: [.useSoftwareRenderer: false])
    for i in 0..<n {
      let t = dur * (Double(i) + 0.5) / Double(n)
      guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
      if let g = gray(cg, w: gw, h: gh, ctx: ctx) { rasters.append(g) }
    }
    guard rasters.count >= 2 else { throw NSError(domain: "Pose", code: 11, userInfo: [NSLocalizedDescriptionKey: "could not sample frames"]) }
    let count = gw * gh

    // per-pixel temporal mean / std / median
    var mean = [Float](repeating: 0, count: count)
    var std = [Float](repeating: 0, count: count)
    var medianBg = [Float](repeating: 0, count: count)
    var col = [Float](repeating: 0, count: rasters.count)
    for p in 0..<count {
      var s: Float = 0
      for r in 0..<rasters.count { col[r] = rasters[r][p]; s += col[r] }
      let m = s / Float(rasters.count)
      var v: Float = 0
      for r in 0..<rasters.count { let d = col[r] - m; v += d * d }
      mean[p] = m
      std[p] = (v / Float(rasters.count)).squareRoot()
      col.sort()
      medianBg[p] = col[col.count / 2]
    }

    // --- auto-crop: moving pixels
    let stdSorted = std.sorted()
    let stdThr = max(4, stdSorted[Int(Double(count) * 0.6)]) // above the 60th percentile and > 4/255
    var moving = [Bool](repeating: false, count: count)
    for p in 0..<count { moving[p] = std[p] > stdThr }
    let movingFrac = Float(moving.filter { $0 }.count) / Float(count)
    var cropRect: CGRect? = nil
    if let box = largestComponentBox(moving, w: gw, h: gh), movingFrac < 0.85 {
      // pad by 2 cells, snap to the raster
      let x0 = max(0, box.minX - 2), y0 = max(0, box.minY - 2)
      let x1 = min(gw, box.maxX + 2), y1 = min(gh, box.maxY + 2)
      let area = Double((x1 - x0) * (y1 - y0)) / Double(count)
      if area > 0.1 {
        cropRect = CGRect(x: Double(x0) / Double(gw), y: Double(y0) / Double(gh), width: Double(x1 - x0) / Double(gw), height: Double(y1 - y0) / Double(gh))
      }
    }
    // camera static = the median background differs little from the per-frame image outside the mover
    var staticScore: Float = 0
    var cnt = 0
    for p in 0..<count where !moving[p] { staticScore += std[p]; cnt += 1 }
    let cameraStatic = cnt == 0 ? false : (staticScore / Float(cnt)) < 6

    // --- floor mat inside the crop (or the whole frame)
    var matQuad: [CGPoint]? = nil
    if cameraStatic {
      let cx0 = Int((cropRect?.minX ?? 0) * Double(gw)), cy0 = Int((cropRect?.minY ?? 0) * Double(gh))
      let cx1 = Int((cropRect?.maxX ?? 1) * Double(gw)), cy1 = Int((cropRect?.maxY ?? 1) * Double(gh))
      if let q = detectMat(medianBg, w: gw, h: gh, x0: cx0, y0: cy0, x1: cx1, y1: cy1) {
        matQuad = q.map { CGPoint(x: ($0.x + 0.5) * Double(W) / Double(gw), y: ($0.y + 0.5) * Double(H) / Double(gh)) }
      }
    }
    return Result(width: W, height: H, cropRect: cropRect, matQuad: matQuad, cameraStatic: cameraStatic, samples: rasters.count, ms: Int((CFAbsoluteTimeGetCurrent() - t0) * 1000))
  }

  // MARK: - helpers

  private static func gray(_ cg: CGImage, w: Int, h: Int, ctx: CIContext) -> [Float]? {
    guard let cs = CGColorSpace(name: CGColorSpace.linearGray) ?? CGColorSpace(name: CGColorSpace.genericGrayGamma2_2) else { return nil }
    var buf = [UInt8](repeating: 0, count: w * h)
    guard let bctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
    bctx.interpolationQuality = .medium
    bctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    return buf.map { Float($0) }
  }

  struct Box { var minX: Int; var minY: Int; var maxX: Int; var maxY: Int }

  /// Largest 4-connected component (by area) of a mask → its bounding box (exclusive max).
  private static func largestComponentBox(_ mask: [Bool], w: Int, h: Int) -> Box? {
    var seen = [Bool](repeating: false, count: w * h)
    var best: (Int, Box)? = nil
    var stack: [Int] = []
    for s in 0..<(w * h) where mask[s] && !seen[s] {
      var area = 0
      var box = Box(minX: s % w, minY: s / w, maxX: s % w, maxY: s / w)
      stack.append(s); seen[s] = true
      while let p = stack.popLast() {
        area += 1
        let x = p % w, y = p / w
        box.minX = min(box.minX, x); box.maxX = max(box.maxX, x); box.minY = min(box.minY, y); box.maxY = max(box.maxY, y)
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
          let nx = x + dx, ny = y + dy
          if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
          let q = ny * w + nx
          if mask[q] && !seen[q] { seen[q] = true; stack.append(q) }
        }
      }
      if best == nil || area > best!.0 { best = (area, box) }
    }
    guard let b = best else { return nil }
    return Box(minX: b.1.minX, minY: b.1.minY, maxX: b.1.maxX + 1, maxY: b.1.maxY + 1)
  }

  /// Mat = darkest large blob in the lower half of the background, grown to the surrounding edges.
  private static func detectMat(_ bg: [Float], w: Int, h: Int, x0: Int, y0: Int, x1: Int, y1: Int) -> [CGPoint]? {
    let rw = x1 - x0, rh = y1 - y0
    guard rw > 8, rh > 8 else { return nil }
    // edge magnitude (Sobel) on the background
    var edge = [Float](repeating: 0, count: w * h)
    for y in 1..<(h - 1) {
      for x in 1..<(w - 1) {
        let i = y * w + x
        let gx = -bg[i - w - 1] - 2 * bg[i - 1] - bg[i + w - 1] + bg[i - w + 1] + 2 * bg[i + 1] + bg[i + w + 1]
        let gy = -bg[i - w - 1] - 2 * bg[i - w] - bg[i - w + 1] + bg[i + w - 1] + 2 * bg[i + w] + bg[i + w + 1]
        edge[i] = (gx * gx + gy * gy).squareRoot()
      }
    }
    // dark core: pixels in the lower 55 % of the crop darker than the crop's 25th percentile
    var vals: [Float] = []
    for y in (y0 + rh * 45 / 100)..<y1 { for x in x0..<x1 { vals.append(bg[y * w + x]) } }
    guard vals.count > 16 else { return nil }
    vals.sort()
    let dark = vals[vals.count / 4]
    var core = [Bool](repeating: false, count: w * h)
    for y in (y0 + rh * 45 / 100)..<y1 { for x in x0..<x1 { let i = y * w + x; core[i] = bg[i] <= dark && edge[i] < 40 } }
    guard let cb = largestComponentBox(core, w: w, h: h) else { return nil }
    let coreArea = (cb.maxX - cb.minX) * (cb.maxY - cb.minY)
    if coreArea < rw * rh / 25 { return nil }
    // grow from the core: flood fill over pixels with similar brightness and no strong edge
    let seedX = (cb.minX + cb.maxX) / 2, seedY = (cb.minY + cb.maxY) / 2
    let seedVal = bg[seedY * w + seedX]
    var region = [Bool](repeating: false, count: w * h)
    var stack = [seedY * w + seedX]
    region[stack[0]] = true
    var pts: [(Int, Int)] = []
    while let p = stack.popLast() {
      let x = p % w, y = p / w
      pts.append((x, y))
      for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let nx = x + dx, ny = y + dy
        if nx < x0 || ny < y0 || nx >= x1 || ny >= y1 { continue }
        let q = ny * w + nx
        if region[q] { continue }
        if edge[q] > 60 { continue }
        if abs(bg[q] - seedVal) > 45 { continue }
        region[q] = true
        stack.append(q)
      }
    }
    let area = pts.count
    // a mat is a floor patch: not most of the frame, and confined to the lower part of the crop
    if area < rw * rh * 8 / 100 || area > rw * rh * 55 / 100 { return nil }
    let minY = pts.map { $0.1 }.min() ?? y0, maxY = pts.map { $0.1 }.max() ?? y1
    if minY < y0 + rh * 40 / 100 { return nil }
    if (maxY - minY) > rh * 55 / 100 { return nil }
    // 4 corners: points of the region extreme along the box diagonals (robust for a perspective quad)
    func extreme(_ score: ((Int, Int)) -> Int) -> CGPoint { let p = pts.max { score($0) < score($1) }!; return CGPoint(x: p.0, y: p.1) }
    let tl = extreme { -($0.0 + $0.1) }
    let tr = extreme { $0.0 - $0.1 }
    let br = extreme { $0.0 + $0.1 }
    let bl = extreme { -$0.0 + $0.1 }
    // convexity / sanity: TL must be above BL and left of TR, etc.
    guard tl.y < bl.y, tr.y < br.y, tl.x < tr.x, bl.x < br.x else { return nil }
    return [tl, tr, br, bl]
  }
}
