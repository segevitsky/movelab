import ExpoModulesCore

/// Crop rectangle in *normalized* video coordinates (0..1, origin top-left), applied after
/// the track's preferredTransform (i.e. in display orientation).
struct NormRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 1
  @Field var height: Double = 1

  var isFull: Bool { x <= 0 && y <= 0 && width >= 1 && height >= 1 }
}

struct ProcessOptions: Record {
  @Field var cropRect: NormRect? = nil
  /// Target sampling rate; frames are skipped to approximate it. 0 = every frame.
  @Field var targetFps: Double = 30
  /// Stop after this many seconds of video (0 = whole video).
  @Field var maxSeconds: Double = 0
  /// "cpu" (default) or "gpu" delegate for MediaPipe.
  @Field var delegate: String = "cpu"
  /// Override the model path (file:// URI). Default: bundled pose_landmarker_heavy.task.
  @Field var modelPath: String? = nil
  @Field var minDetectionConfidence: Double = 0.4
  @Field var minPresenceConfidence: Double = 0.4
  @Field var minTrackingConfidence: Double = 0.4
  /// Phase 17: "mediapipe" (default) or "hybrid" = MediaPipe (3D world track) + RTMW whole-body for the 2D points.
  @Field var engine: String = "mediapipe"
  /// Override the RTMW model path (file:// URI). Default: the bundled rtmw-*.onnx.
  @Field var rtmwModelPath: String? = nil
  /// Run RTMW through the CoreML execution provider (ANE/GPU) when available.
  @Field var rtmwCoreML: Bool = true
}

struct FrameImageOptions: Record {
  @Field var cropRect: NormRect? = nil
  /// Longest side of the output JPEG in px (0 = native).
  @Field var maxSide: Double = 0
}

struct SceneDiffOptions: Record {
  @Field var cropRect: NormRect? = nil
  /// Kept frames per second (0 = every frame).
  @Field var sampleFps: Double = 10
}

final class PoseException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Pose: \(param)" }
}
