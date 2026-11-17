package expo.modules.pose

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Crop rectangle in *normalised* video coordinates (0..1, origin top-left), in display orientation. */
class NormRect : Record {
  @Field var x: Double = 0.0
  @Field var y: Double = 0.0
  @Field var width: Double = 1.0
  @Field var height: Double = 1.0
  val isFull: Boolean get() = x <= 0 && y <= 0 && width >= 1 && height >= 1
}

class ProcessOptions : Record {
  @Field var cropRect: NormRect? = null
  /** Target sampling rate; frames are skipped to approximate it. 0 = every frame. */
  @Field var targetFps: Double = 30.0
  /** Stop after this many seconds of video (0 = whole video). */
  @Field var maxSeconds: Double = 0.0
  /** "cpu" (default) or "gpu" delegate for MediaPipe (falls back to CPU when the GPU delegate fails). */
  @Field var delegate: String = "cpu"
  @Field var modelPath: String? = null
  @Field var minDetectionConfidence: Double = 0.4
  @Field var minPresenceConfidence: Double = 0.4
  @Field var minTrackingConfidence: Double = 0.4
  /** "mediapipe" (default) or "hybrid" = MediaPipe (3D world track) + RTMW whole-body for the 2D points. */
  @Field var engine: String = "mediapipe"
  @Field var rtmwModelPath: String? = null
  /** iOS: CoreML. Android: the same flag means "use the NNAPI accelerator when available". */
  @Field var rtmwCoreML: Boolean = true
}

class FrameImageOptions : Record {
  @Field var cropRect: NormRect? = null
  /** Longest side of the output JPEG in px (0 = native). */
  @Field var maxSide: Double = 0.0
}

class SceneDiffOptions : Record {
  @Field var cropRect: NormRect? = null
  /** Kept frames per second (0 = every frame). */
  @Field var sampleFps: Double = 10.0
}

class PoseException(message: String) : CodedException("Pose: $message")
