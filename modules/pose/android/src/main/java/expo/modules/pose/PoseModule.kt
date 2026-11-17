package expo.modules.pose

import android.content.Context
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.roundToInt

/**
 * Android port of ios/PoseModule.swift: video file → MediaPipe Pose 33 landmarks (+ 3D world track), and with
 * engine "hybrid" the RTMW whole-body model for the 2D points, hands and feet. Plain JSON out, same shape as iOS.
 * Not here (iOS only): Apple Vision second opinion (`processVision` throws), Vision person boxes (the box comes
 * from MediaPipe's landmarks, else the whole frame).
 */
class PoseModule : Module() {
  @Volatile private var cancelRequested = false
  private val context: Context get() = appContext.reactContext ?: throw PoseException("no Android context")

  override fun definition() = ModuleDefinition {
    Name("Pose")

    Events("progress")

    Function("modelInfo") {
      val name = MP_MODEL
      // assets may be stored compressed (no file descriptor); stream to measure
      val bytes = try { context.assets.open(name).use { s -> var n = 0L; val buf = ByteArray(1 shl 16); while (true) { val r = s.read(buf); if (r < 0) break; n += r }; n } } catch (e: Exception) { 0L }
      mapOf("path" to (if (bytes > 0) "asset://$name" else null), "bytes" to bytes, "found" to (bytes > 0))
    }

    Function("cancel") { cancelRequested = true }

    AsyncFunction("videoInfo") { fileUri: String ->
      VideoFrames(context, Uri.parse(fileUri), null, 0.0).use { f ->
        mapOf("duration" to f.info.duration, "width" to f.info.width, "height" to f.info.height, "fps" to f.info.nominalFps)
      }
    }

    AsyncFunction("frameImage") { fileUri: String, seconds: Double, options: FrameImageOptions ->
      val (uri, w, h) = VideoFrames.jpeg(context, Uri.parse(fileUri), seconds, options.cropRect, options.maxSide)
      mapOf("uri" to uri.toString(), "width" to w, "height" to h)
    }

    AsyncFunction("sceneAnalysis") { fileUri: String ->
      val r = SceneAnalysis.analyze(context, Uri.parse(fileUri))
      val out = mutableMapOf<String, Any?>("width" to r.width, "height" to r.height, "cameraStatic" to r.cameraStatic, "samples" to r.samples, "ms" to r.ms)
      r.cropRect?.let { out["cropRect"] = mapOf("x" to it.left.toDouble(), "y" to it.top.toDouble(), "width" to (it.right - it.left).toDouble(), "height" to (it.bottom - it.top).toDouble()) }
      r.matQuad?.let { q -> out["matQuad"] = q.map { listOf(it.x.toDouble(), it.y.toDouble()) } }
      out
    }

    AsyncFunction("sceneDiff") { fileUri: String, options: SceneDiffOptions ->
      val r = SceneDiff.compute(context, Uri.parse(fileUri), options.cropRect, options.sampleFps)
      mapOf("sampleFps" to r.sampleFps, "samples" to r.samples.map { it.toList() }, "ms" to r.ms)
    }

    AsyncFunction("process") { fileUri: String, options: ProcessOptions ->
      try { runMediaPipe(Uri.parse(fileUri), options) } catch (e: Throwable) {
        android.util.Log.e("Pose", "process failed", e)
        val cause = generateSequence<Throwable>(e) { it.cause }.last()
        throw PoseException("${e::class.java.simpleName}: ${e.message ?: ""} (cause: ${cause::class.java.simpleName}: ${cause.message ?: ""})")
      }
    }

    AsyncFunction("processVision") { fileUri: String, options: ProcessOptions ->
      if (fileUri.isNotEmpty() || options.targetFps >= 0) throw PoseException("Vision (second opinion) is iOS-only")
      emptyMap<String, Any?>()
    }
  }

  private fun runMediaPipe(uri: Uri, options: ProcessOptions): Map<String, Any?> {
    cancelRequested = false
    val t0 = SystemClock.elapsedRealtime()
    var delegateUsed = options.delegate.lowercase()
    var landmarker = try {
      makeLandmarker(options, delegateUsed == "gpu")
    } catch (e: Exception) {
      if (delegateUsed == "gpu") { android.util.Log.w("Pose", "GPU delegate failed, using CPU: $e"); delegateUsed = "cpu"; makeLandmarker(options, false) } else throw e
    }
    // the GPU delegate can also fail on the first *run* (software GL on the emulator: GL_INVALID_ENUM in the
    // TFLite GPU buffer code); then rebuild on the CPU and redo that frame
    fun detect(bmp: android.graphics.Bitmap, ts: Long) = try {
      landmarker.detectForVideo(BitmapImageBuilder(bmp).build(), ts)
    } catch (e: Exception) {
      if (delegateUsed != "gpu") throw e
      android.util.Log.w("Pose", "GPU delegate failed while running, switching to CPU: $e")
      try { landmarker.close() } catch (_: Exception) {}
      delegateUsed = "cpu"
      landmarker = makeLandmarker(options, false)
      landmarker.detectForVideo(BitmapImageBuilder(bmp).build(), ts)
    }
    var rtmw: RTMW? = null
    if (options.engine.lowercase() == "hybrid") {
      val path = options.rtmwModelPath?.let { Uri.parse(it).path ?: it } ?: rtmwFile().absolutePath
      rtmw = RTMW(path, options.rtmwCoreML)
    }
    val tInit = SystemClock.elapsedRealtime() - t0
    var rtmwMs = 0L; var rtmwDetected = 0
    val out = ArrayList<Map<String, Any?>>()
    var detected = 0
    var inferMs = 0L
    val tStart = SystemClock.elapsedRealtime()
    var cancelled: Boolean
    try {
      VideoFrames(context, uri, options.cropRect, options.maxSeconds).use { frames ->
        val W = frames.outWidth.toDouble(); val H = frames.outHeight.toDouble()
        val stride = if (options.targetFps > 0 && frames.info.nominalFps > options.targetFps) (frames.info.nominalFps / options.targetFps).roundToInt() else 1
        val total = ((if (options.maxSeconds > 0) minOf(options.maxSeconds, frames.info.duration) else frames.info.duration) * frames.info.nominalFps).toInt()
        var lastTs = -1L
        var i = 0
        while (!cancelRequested) {
          if (stride > 1 && i % stride != 0) { if (frames.skip() == null) break; i++; continue }
          val (t, bmp) = frames.next() ?: break
          i++
          var ts = (t * 1000).toLong()
          if (ts <= lastTs) ts = lastTs + 1
          lastTs = ts
          val entry = LinkedHashMap<String, Any?>()
          entry["t"] = (t * 10000).roundToInt() / 10000.0
          val ti = SystemClock.elapsedRealtime()
          val result = detect(bmp, ts)
          inferMs += SystemClock.elapsedRealtime() - ti
          var mpXY: List<List<Double>>? = null
          val lms = result.landmarks()
          if (lms.isNotEmpty() && lms[0].size == 33) {
            detected++
            val lm = lms[0]
            mpXY = lm.map { listOf(r2(it.x().toDouble() * W), r2(it.y().toDouble() * H)) }
            entry["xy"] = mpXY
            entry["z"] = lm.map { r2(it.z().toDouble() * W) }
            entry["v"] = lm.map { r3((it.visibility().orElse(0f)).toDouble()) }
            val wls = result.worldLandmarks()
            if (wls.isNotEmpty() && wls[0].size == 33) entry["w"] = wls[0].map { listOf(r4(it.x().toDouble()), r4(it.y().toDouble()), r4(it.z().toDouble())) }
          }
          val rt = rtmw
          if (rt != null) {
            var box: RectF? = null
            val m = mpXY
            if (m != null) {
              val xs = m.map { it[0] }; val ys = m.map { it[1] }
              val x0 = xs.min(); val x1 = xs.max(); val y0 = ys.min(); val y1 = ys.max()
              if (x1 > x0 && y1 > y0) box = RectF(x0.toFloat(), y0.toFloat(), x1.toFloat(), y1.toFloat())
            }
            val tr = SystemClock.elapsedRealtime()
            val (kps, scores) = rt.infer(bmp, box ?: RectF(0f, 0f, W.toFloat(), H.toFloat()))
            rtmwMs += SystemClock.elapsedRealtime() - tr
            var bodyScore = 0.0
            for (k in 0 until 17) bodyScore += scores[k]
            bodyScore /= 17
            if (bodyScore >= 0.3) {
              rtmwDetected++
              if (mpXY == null) detected++
              val (mxy, mv) = RTMW.toMediaPipe33(kps, scores)
              if (mpXY != null) entry["mp"] = mapOf("xy" to mpXY, "v" to (entry["v"] ?: emptyList<Double>()))
              @Suppress("UNCHECKED_CAST")
              val mpV = entry["v"] as? List<Double>
              entry["xy"] = (0 until 33).map { j -> val p = mxy[j]; if (p != null) listOf(r2(p[0]), r2(p[1])) else mpXY?.get(j) ?: listOf(0.0, 0.0) }
              entry["v"] = (0 until 33).map { j -> if (mxy[j] != null) r3(mv[j]) else (mpV?.get(j) ?: 0.0) }
              entry["wb"] = mapOf(
                "hands" to listOf(RTMW.handL, RTMW.handR).map { base -> (0 until 21).map { listOf(r2(kps[base + it][0]), r2(kps[base + it][1])) } },
                "handScores" to listOf(RTMW.handL, RTMW.handR).map { base -> (0 until 21).map { r3(scores[base + it]) } },
                "feet" to (17 until 23).map { listOf(r2(kps[it][0]), r2(kps[it][1])) },
                "feetScores" to (17 until 23).map { r3(scores[it]) },
                "box" to (box?.let { listOf(r2(it.left.toDouble()), r2(it.top.toDouble()), r2(it.right.toDouble()), r2(it.bottom.toDouble())) } ?: emptyList()),
              )
            }
          }
          out.add(entry)
          if (out.size % 15 == 0) sendEvent("progress", mapOf("done" to i, "total" to total, "detected" to detected))
        }
        cancelled = cancelRequested
        val elapsed = SystemClock.elapsedRealtime() - tStart
        return mapOf(
          "source" to (if (rtmw != null) "hybrid" else "mediapipe"),
          "model" to (if (rtmw != null) "pose_landmarker_heavy+${rtmw.modelName}" else "pose_landmarker_heavy"),
          "engine" to (if (rtmw != null) mapOf("rtmw" to rtmw.modelName, "coreML" to rtmw.accelerated, "loadMs" to rtmw.loadMs, "rtmwMs" to rtmwMs.toInt(), "rtmwDetected" to rtmwDetected, "boxesFromVision" to 0) else emptyMap<String, Any>()),
          "delegate" to delegateUsed,
          "fps" to (if (stride > 1) frames.info.nominalFps / stride else frames.info.nominalFps),
          "width" to frames.outWidth, "height" to frames.outHeight,
          "fullWidth" to frames.info.width, "fullHeight" to frames.info.height,
          "duration" to frames.info.duration,
          "frames" to out,
          "stats" to mapOf("frames" to out.size, "detected" to detected, "ms" to elapsed.toInt(), "inferMs" to inferMs.toInt(),
            "initMs" to tInit.toInt(), "msPerFrame" to (if (out.isEmpty()) 0 else (elapsed / out.size).toInt()),
            "cancelled" to cancelled, "device" to "${Build.MANUFACTURER} ${Build.MODEL}"),
        )
      }
    } finally {
      try { landmarker.close() } catch (_: Exception) {}
      rtmw?.close()
    }
  }

  private fun makeLandmarker(options: ProcessOptions, gpu: Boolean): PoseLandmarker {
    val base = BaseOptions.builder()
    val custom = options.modelPath?.let { Uri.parse(it).path ?: it }
    if (custom != null) base.setModelAssetPath(custom) else base.setModelAssetPath(MP_MODEL)
    base.setDelegate(if (gpu) Delegate.GPU else Delegate.CPU)
    val opts = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(base.build())
      .setRunningMode(RunningMode.VIDEO)
      .setNumPoses(1)
      .setMinPoseDetectionConfidence(options.minDetectionConfidence.toFloat())
      .setMinPosePresenceConfidence(options.minPresenceConfidence.toFloat())
      .setMinTrackingConfidence(options.minTrackingConfidence.toFloat())
      .setOutputSegmentationMasks(false)
      .build()
    return PoseLandmarker.createFromOptions(context, opts)
  }

  /** ONNX Runtime wants a file path: copy the bundled model out of the assets once (the asset may be stored
   *  compressed, so it is streamed; a temp file + rename guards against a half-written copy). */
  private fun rtmwFile(): File {
    val name = context.assets.list("")?.firstOrNull { it.startsWith("rtmw") && it.endsWith(".onnx") } ?: throw PoseException("RTMW model (rtmw-*.onnx) not found in assets")
    val dir = File(context.filesDir, "models").apply { mkdirs() }
    val dst = File(dir, name)
    if (!dst.exists() || dst.length() < 1_000_000) {
      val tmp = File(dir, "$name.part")
      context.assets.open(name).use { input -> tmp.outputStream().use { input.copyTo(it) } }
      if (!tmp.renameTo(dst)) throw PoseException("could not place the RTMW model in ${dst.path}")
    }
    return dst
  }

  companion object {
    const val MP_MODEL = "pose_landmarker_heavy.task"
    private fun r2(v: Double) = Math.round(v * 100) / 100.0
    private fun r3(v: Double) = Math.round(v * 1000) / 1000.0
    private fun r4(v: Double) = Math.round(v * 10000) / 10000.0
  }
}
