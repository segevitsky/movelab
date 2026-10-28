import ExpoModulesCore
import AVFoundation
import Vision
import MediaPipeTasksVision

/// MediaPipe Pose 33 landmark order is used everywhere. Vision's 2D body pose (19 joints, no feet)
/// is mapped onto the same 33 slots; missing slots get xy=[0,0], v=0.
private let visionToMP: [(VNHumanBodyPoseObservation.JointName, Int)] = [
  (.nose, 0), (.leftEye, 2), (.rightEye, 5), (.leftEar, 7), (.rightEar, 8),
  (.leftShoulder, 11), (.rightShoulder, 12), (.leftElbow, 13), (.rightElbow, 14),
  (.leftWrist, 15), (.rightWrist, 16), (.leftHip, 23), (.rightHip, 24),
  (.leftKnee, 25), (.rightKnee, 26), (.leftAnkle, 27), (.rightAnkle, 28),
]

public final class PoseModule: Module {
  private var cancelRequested = false

  public func definition() -> ModuleDefinition {
    Name("Pose")

    Events("progress")

    Function("modelInfo") { () -> [String: Any] in
      let path = Self.bundledModelPath()
      var size: Int64 = 0
      if let p = path, let attrs = try? FileManager.default.attributesOfItem(atPath: p) { size = (attrs[.size] as? Int64) ?? 0 }
      return ["path": path as Any, "bytes": size, "found": path != nil]
    }

    Function("cancel") { self.cancelRequested = true }

    AsyncFunction("videoInfo") { (fileUri: URL) -> [String: Any] in
      let frames = try VideoFrames(url: fileUri, crop: nil, maxSeconds: 0)
      defer { frames.close() }
      return ["duration": frames.info.duration, "width": frames.info.width, "height": frames.info.height, "fps": frames.info.nominalFps]
    }

    AsyncFunction("frameImage") { (fileUri: URL, seconds: Double, options: FrameImageOptions) -> [String: Any] in
      let (url, w, h) = try VideoFrames.jpeg(url: fileUri, at: seconds, crop: options.cropRect?.cgRect, maxSide: options.maxSide)
      return ["uri": url.absoluteString, "width": w, "height": h]
    }

    /// Architecture §5a: auto-crop of the reel area + floor-mat quad (+ camera-static flag).
    AsyncFunction("sceneAnalysis") { (fileUri: URL) -> [String: Any] in
      let r = try SceneAnalysis.analyze(url: fileUri)
      var out: [String: Any] = ["width": r.width, "height": r.height, "cameraStatic": r.cameraStatic, "samples": r.samples, "ms": r.ms]
      if let c = r.cropRect { out["cropRect"] = ["x": c.minX, "y": c.minY, "width": c.width, "height": c.height] }
      if let q = r.matQuad { out["matQuad"] = q.map { [$0.x, $0.y] } }
      return out
    }

    AsyncFunction("process") { (fileUri: URL, options: ProcessOptions) -> [String: Any] in
      try self.runMediaPipe(url: fileUri, options: options)
    }

    AsyncFunction("processVision") { (fileUri: URL, options: ProcessOptions) -> [String: Any] in
      try self.runVision(url: fileUri, options: options)
    }
  }

  // MARK: - MediaPipe

  private func runMediaPipe(url: URL, options: ProcessOptions) throws -> [String: Any] {
    cancelRequested = false
    guard let modelPath = options.modelPath.flatMap({ URL(string: $0)?.path ?? $0 }) ?? Self.bundledModelPath() else {
      throw PoseException("model file pose_landmarker_heavy.task not found in bundle")
    }
    let mpOptions = PoseLandmarkerOptions()
    mpOptions.baseOptions.modelAssetPath = modelPath
    mpOptions.baseOptions.delegate = options.delegate.lowercased() == "gpu" ? .GPU : .CPU
    mpOptions.runningMode = .video
    mpOptions.numPoses = 1
    mpOptions.minPoseDetectionConfidence = Float(options.minDetectionConfidence)
    mpOptions.minPosePresenceConfidence = Float(options.minPresenceConfidence)
    mpOptions.minTrackingConfidence = Float(options.minTrackingConfidence)
    mpOptions.shouldOutputSegmentationMasks = false

    let t0 = CFAbsoluteTimeGetCurrent()
    let landmarker = try PoseLandmarker(options: mpOptions)
    let tInit = CFAbsoluteTimeGetCurrent() - t0

    let frames = try VideoFrames(url: url, crop: options.cropRect?.cgRect, maxSeconds: options.maxSeconds)
    defer { frames.close() }
    let W = Double(frames.outWidth), H = Double(frames.outHeight)
    let stride = options.targetFps > 0 && frames.info.nominalFps > options.targetFps
      ? Int((frames.info.nominalFps / options.targetFps).rounded()) : 1
    let total = Int((options.maxSeconds > 0 ? min(options.maxSeconds, frames.info.duration) : frames.info.duration) * frames.info.nominalFps)

    var out: [[String: Any]] = []
    var detected = 0
    var lastTs = -1
    var i = 0
    var inferMs = 0.0
    let tStart = CFAbsoluteTimeGetCurrent()
    loop: while !cancelRequested {
      // Every frame allocates autoreleased ObjC objects (sample buffer, MPImage, result). Without a
      // per-iteration pool they live until this function returns -> jetsam on a 30 s clip.
      let keepGoing: Bool = try autoreleasepool {
        if stride > 1 && i % stride != 0 { if frames.skip() == nil { return false }; i += 1; return true }
        guard let (t, pb) = frames.next() else { return false }
        i += 1
        var ts = Int(t * 1000)
        if ts <= lastTs { ts = lastTs + 1 }
        lastTs = ts
        var entry: [String: Any] = ["t": (t * 10000).rounded() / 10000]
        let image = try MPImage(pixelBuffer: pb)
        let ti = CFAbsoluteTimeGetCurrent()
        let result = try landmarker.detect(videoFrame: image, timestampInMilliseconds: ts)
        inferMs += (CFAbsoluteTimeGetCurrent() - ti) * 1000
        if let lm = result.landmarks.first, lm.count == 33 {
          detected += 1
          entry["xy"] = lm.map { [r2(Double($0.x) * W), r2(Double($0.y) * H)] }
          entry["z"] = lm.map { r2(Double($0.z) * W) }
          entry["v"] = lm.map { r3(Double(truncating: $0.visibility ?? 0)) }
          if let wl = result.worldLandmarks.first, wl.count == 33 {
            entry["w"] = wl.map { [r4(Double($0.x)), r4(Double($0.y)), r4(Double($0.z))] }
          }
        }
        out.append(entry)
        if out.count % 15 == 0 { sendEvent("progress", ["done": i, "total": total, "detected": detected]) }
        return true
      }
      if !keepGoing { break loop }
    }
    let elapsed = CFAbsoluteTimeGetCurrent() - tStart
    return [
      "source": "mediapipe",
      "model": "pose_landmarker_heavy",
      "delegate": options.delegate,
      "fps": stride > 1 ? frames.info.nominalFps / Double(stride) : frames.info.nominalFps,
      "width": frames.outWidth, "height": frames.outHeight,
      "fullWidth": frames.info.width, "fullHeight": frames.info.height,
      "duration": frames.info.duration,
      "frames": out,
      "stats": ["frames": out.count, "detected": detected, "ms": Int(elapsed * 1000), "inferMs": Int(inferMs),
                "initMs": Int(tInit * 1000), "msPerFrame": out.isEmpty ? 0 : Int(elapsed * 1000) / out.count,
                "cancelled": cancelRequested, "device": Self.deviceModel()],
    ]
  }

  // MARK: - Apple Vision (2D) for comparison / fallback

  private func runVision(url: URL, options: ProcessOptions) throws -> [String: Any] {
    cancelRequested = false
    let frames = try VideoFrames(url: url, crop: options.cropRect?.cgRect, maxSeconds: options.maxSeconds)
    defer { frames.close() }
    let W = Double(frames.outWidth), H = Double(frames.outHeight)
    let stride = options.targetFps > 0 && frames.info.nominalFps > options.targetFps
      ? Int((frames.info.nominalFps / options.targetFps).rounded()) : 1
    let total = Int((options.maxSeconds > 0 ? min(options.maxSeconds, frames.info.duration) : frames.info.duration) * frames.info.nominalFps)
    let request = VNDetectHumanBodyPoseRequest()
    var out: [[String: Any]] = []
    var detected = 0
    var i = 0
    let tStart = CFAbsoluteTimeGetCurrent()
    loop: while !cancelRequested {
      let keepGoing: Bool = try autoreleasepool {
        if stride > 1 && i % stride != 0 { if frames.skip() == nil { return false }; i += 1; return true }
        guard let (t, pb) = frames.next() else { return false }
        i += 1
        var entry: [String: Any] = ["t": (t * 10000).rounded() / 10000]
        let handler = VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up, options: [:])
        try handler.perform([request])
        if let obs = request.results?.first, let pts = try? obs.recognizedPoints(.all) {
          var xy = Array(repeating: [0.0, 0.0], count: 33)
          var v = Array(repeating: 0.0, count: 33)
          var any = false
          for (name, idx) in visionToMP {
            if let p = pts[name], p.confidence > 0 {
              xy[idx] = [r2(Double(p.location.x) * W), r2((1 - Double(p.location.y)) * H)]
              v[idx] = r3(Double(p.confidence))
              any = true
            }
          }
          if any { detected += 1; entry["xy"] = xy; entry["v"] = v }
        }
        out.append(entry)
        if out.count % 15 == 0 { sendEvent("progress", ["done": i, "total": total, "detected": detected]) }
        return true
      }
      if !keepGoing { break loop }
    }
    let elapsed = CFAbsoluteTimeGetCurrent() - tStart
    return [
      "source": "vision", "model": "VNDetectHumanBodyPoseRequest",
      "fps": stride > 1 ? frames.info.nominalFps / Double(stride) : frames.info.nominalFps,
      "width": frames.outWidth, "height": frames.outHeight,
      "fullWidth": frames.info.width, "fullHeight": frames.info.height,
      "duration": frames.info.duration,
      "frames": out,
      "stats": ["frames": out.count, "detected": detected, "ms": Int(elapsed * 1000),
                "msPerFrame": out.isEmpty ? 0 : Int(elapsed * 1000) / out.count,
                "cancelled": cancelRequested, "device": Self.deviceModel()],
    ]
  }

  // MARK: - helpers

  static func bundledModelPath() -> String? {
    if let p = Bundle.main.path(forResource: "pose_landmarker_heavy", ofType: "task") { return p }
    if let p = Bundle(for: PoseModule.self).path(forResource: "pose_landmarker_heavy", ofType: "task") { return p }
    if let b = Bundle(for: PoseModule.self).url(forResource: "Pose", withExtension: "bundle").flatMap(Bundle.init(url:)),
       let p = b.path(forResource: "pose_landmarker_heavy", ofType: "task") { return p }
    return nil
  }

  static func deviceModel() -> String {
    var sys = utsname(); uname(&sys)
    return withUnsafePointer(to: &sys.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
  }
}

extension NormRect {
  var cgRect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
}

@inline(__always) private func r2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
@inline(__always) private func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }
@inline(__always) private func r4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
