import CoreGraphics
import CoreVideo
import Foundation
import VideoToolbox
import Vision
import onnxruntime_objc

/// Phase 17 — RTMW (RTMPose whole-body, COCO-WholeBody 133 keypoints) on device through ONNX Runtime.
/// Pre/post-processing is a port of rtmlib's RTMPose (the behavioural spec of scripts/rtmw_spike.py):
/// person box → centre/scale (padding 1.25, aspect fixed to the model input) → crop + resize to 192×256
/// (BGR float, ImageNet mean/std in that channel order, exactly as rtmlib feeds cv2 frames) → SimCC argmax / 2
/// → back to image px. Output order: 0–16 COCO body, 17–22 feet (L big toe, L small toe, L heel, R …),
/// 23–90 face, 91–111 left hand, 112–132 right hand.
final class RTMW {
  static let inputW = 192, inputH = 256, numKeypoints = 133
  private static let mean: [Float] = [123.675, 116.28, 103.53]
  private static let std: [Float] = [58.395, 57.12, 57.375]

  private let env: ORTEnv
  private let session: ORTSession
  private let inputName: String
  private let outputNames: [String]
  let modelName: String
  let coreML: Bool
  private let ctx: CGContext
  private var input = [Float](repeating: 0, count: 3 * RTMW.inputW * RTMW.inputH)

  init(modelPath: String, coreML: Bool) throws {
    env = try ORTEnv(loggingLevel: .warning)
    let opts = try ORTSessionOptions()
    try opts.setIntraOpNumThreads(4)
    var usedCoreML = false
    if coreML {
      do {
        let cml = ORTCoreMLExecutionProviderOptions()
        cml.enableOnSubgraphs = true
        try opts.appendCoreMLExecutionProvider(with: cml)
        usedCoreML = true
      } catch { NSLog("RTMW: CoreML execution provider unavailable, using CPU (\(error))") }
    }
    session = try ORTSession(env: env, modelPath: modelPath, sessionOptions: opts)
    inputName = try session.inputNames().first ?? "input"
    outputNames = try session.outputNames()
    modelName = (modelPath as NSString).lastPathComponent
    self.coreML = usedCoreML
    guard let c = CGContext(data: nil, width: RTMW.inputW, height: RTMW.inputH, bitsPerComponent: 8, bytesPerRow: RTMW.inputW * 4,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else {
      throw PoseException("RTMW: could not create the crop context")
    }
    ctx = c
  }

  /// The largest person in the frame (Vision human rectangles), in pixel coordinates; nil when none is found.
  static func personBox(_ pb: CVPixelBuffer) -> CGRect? {
    let req = VNDetectHumanRectanglesRequest()
    if #available(iOS 15.0, *) { req.upperBodyOnly = false }
    let handler = VNImageRequestHandler(cvPixelBuffer: pb, options: [:])
    guard (try? handler.perform([req])) != nil, let obs = req.results, !obs.isEmpty else { return nil }
    let W = CGFloat(CVPixelBufferGetWidth(pb)), H = CGFloat(CVPixelBufferGetHeight(pb))
    let best = obs.max { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }!
    let b = best.boundingBox // normalised, origin bottom-left
    return CGRect(x: b.minX * W, y: (1 - b.maxY) * H, width: b.width * W, height: b.height * H)
  }

  /// Run on one frame. `box` is xyxy in pixels of `pb`. Returns 133 keypoints (px) and scores.
  func infer(_ pb: CVPixelBuffer, box: CGRect) throws -> (kps: [[Double]], scores: [Double]) {
    // centre / scale with padding 1.25, aspect ratio fixed to the model input (rtmlib bbox_xyxy2cs + top_down_affine)
    let cx = box.midX, cy = box.midY
    var sw = box.width * 1.25, sh = box.height * 1.25
    let aspect = CGFloat(RTMW.inputW) / CGFloat(RTMW.inputH)
    if sw > sh * aspect { sh = sw / aspect } else { sw = sh * aspect }
    let x0 = cx - sw / 2, y0 = cy - sh / 2

    var cgOpt: CGImage?
    VTCreateCGImageFromCVPixelBuffer(pb, options: nil, imageOut: &cgOpt)
    guard let cg = cgOpt else { throw PoseException("RTMW: frame → CGImage failed") }
    ctx.saveGState()
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: RTMW.inputW, height: RTMW.inputH))
    // y-down drawing: flip, then place the source so that the crop rect maps onto the whole context
    ctx.translateBy(x: 0, y: CGFloat(RTMW.inputH))
    ctx.scaleBy(x: 1, y: -1)
    let s = CGFloat(RTMW.inputW) / sw
    ctx.interpolationQuality = .medium
    ctx.draw(cg, in: CGRect(x: -x0 * s, y: -y0 * s, width: CGFloat(cg.width) * s, height: CGFloat(cg.height) * s))
    ctx.restoreGState()

    guard let data = ctx.data else { throw PoseException("RTMW: crop context has no data") }
    let px = data.bindMemory(to: UInt8.self, capacity: RTMW.inputW * RTMW.inputH * 4)
    let plane = RTMW.inputW * RTMW.inputH
    // byteOrder32Little + premultipliedFirst = BGRA in memory; rtmlib feeds cv2's BGR with mean[0] on channel 0
    for i in 0..<plane {
      let b = Float(px[i * 4]), g = Float(px[i * 4 + 1]), r = Float(px[i * 4 + 2])
      input[i] = (b - RTMW.mean[0]) / RTMW.std[0]
      input[plane + i] = (g - RTMW.mean[1]) / RTMW.std[1]
      input[2 * plane + i] = (r - RTMW.mean[2]) / RTMW.std[2]
    }
    let tensorData = NSMutableData(bytes: &input, length: input.count * MemoryLayout<Float>.size)
    let tensor = try ORTValue(tensorData: tensorData, elementType: .float, shape: [1, 3, NSNumber(value: RTMW.inputH), NSNumber(value: RTMW.inputW)])
    let outputs = try session.run(withInputs: [inputName: tensor], outputNames: Set(outputNames), runOptions: nil)
    guard let sx = outputs["simcc_x"], let sy = outputs["simcc_y"] else { throw PoseException("RTMW: unexpected outputs \(outputs.keys)") }
    let dx = try sx.tensorData() as Data, dy = try sy.tensorData() as Data
    let shx = try sx.tensorTypeAndShapeInfo().shape.map { $0.intValue }, shy = try sy.tensorTypeAndShapeInfo().shape.map { $0.intValue }
    let K = shx[1], Wx = shx[2], Wy = shy[2]
    var kps = [[Double]](repeating: [0, 0], count: K)
    var scores = [Double](repeating: 0, count: K)
    dx.withUnsafeBytes { (bx: UnsafeRawBufferPointer) in
      dy.withUnsafeBytes { (by: UnsafeRawBufferPointer) in
        let fx = bx.bindMemory(to: Float.self), fy = by.bindMemory(to: Float.self)
        for k in 0..<K {
          var mx: Float = -Float.greatestFiniteMagnitude, ix = 0
          for j in 0..<Wx { let v = fx[k * Wx + j]; if v > mx { mx = v; ix = j } }
          var my: Float = -Float.greatestFiniteMagnitude, iy = 0
          for j in 0..<Wy { let v = fy[k * Wy + j]; if v > my { my = v; iy = j } }
          let score = Double((mx + my) / 2)
          scores[k] = max(0, score)
          // simcc split ratio 2 → px of the 192×256 crop → image px
          let lx = Double(ix) / 2, ly = Double(iy) / 2
          kps[k] = [lx / Double(RTMW.inputW) * Double(sw) + Double(x0), ly / Double(RTMW.inputH) * Double(sh) + Double(y0)]
        }
      }
    }
    return (kps, scores)
  }

  // MARK: - COCO-WholeBody → MediaPipe-33 mapping (mirrors scripts/rtmw_spike.py)
  static let body: [Int: Int] = [0: 0, 1: 2, 2: 5, 3: 7, 4: 8, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28]
  static let feet: [Int: Int] = [17: 31, 19: 29, 20: 32, 22: 30]
  static let handL = 91, handR = 112
  static let hands: [Int: Int] = [handL + 17: 17, handR + 17: 18, handL + 5: 19, handR + 5: 20, handL + 2: 21, handR + 2: 22]

  /// 33 MediaPipe-order points (+ scores) from the 133; points RTMW does not have (inner face) stay nil.
  static func toMediaPipe33(_ kps: [[Double]], _ scores: [Double]) -> (xy: [[Double]?], v: [Double]) {
    var xy = [[Double]?](repeating: nil, count: 33)
    var v = [Double](repeating: 0, count: 33)
    for (src, dst) in body.merging(feet) { $1 }.merging(hands) { $1 } where src < kps.count {
      xy[dst] = kps[src]; v[dst] = scores[src]
    }
    return (xy, v)
  }
}
