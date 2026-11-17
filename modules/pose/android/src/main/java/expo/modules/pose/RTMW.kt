package expo.modules.pose

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import java.io.File
import java.nio.FloatBuffer

/**
 * Phase 17 — RTMW (RTMPose whole-body, 133 keypoints) through ONNX Runtime; port of ios/RTMW.swift with the same
 * rtmlib preprocessing (person box → centre/scale, padding 1.25, aspect fixed to 192×256; BGR with ImageNet mean/std;
 * SimCC argmax / 2). Accelerator: NNAPI when asked for and available, else the CPU provider.
 */
class RTMW(modelPath: String, accelerate: Boolean) {
  companion object {
    const val inputW = 192; const val inputH = 256; const val numKeypoints = 133
    private val mean = floatArrayOf(123.675f, 116.28f, 103.53f)
    private val std = floatArrayOf(58.395f, 57.12f, 57.375f)
    val body = mapOf(0 to 0, 1 to 2, 2 to 5, 3 to 7, 4 to 8, 5 to 11, 6 to 12, 7 to 13, 8 to 14, 9 to 15, 10 to 16, 11 to 23, 12 to 24, 13 to 25, 14 to 26, 15 to 27, 16 to 28)
    val feet = mapOf(17 to 31, 19 to 29, 20 to 32, 22 to 30)
    const val handL = 91; const val handR = 112
    val hands = mapOf(handL + 17 to 17, handR + 17 to 18, handL + 5 to 19, handR + 5 to 20, handL + 2 to 21, handR + 2 to 22)

    /** 33 MediaPipe-order points (+ scores) from the 133; points RTMW does not have stay null. */
    fun toMediaPipe33(kps: Array<DoubleArray>, scores: DoubleArray): Pair<Array<DoubleArray?>, DoubleArray> {
      val xy = arrayOfNulls<DoubleArray>(33)
      val v = DoubleArray(33)
      for (m in listOf(body, feet, hands)) for ((src, dst) in m) if (src < kps.size) { xy[dst] = kps[src]; v[dst] = scores[src] }
      return Pair(xy, v)
    }
  }

  private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
  private val session: OrtSession
  private val inputName: String
  val modelName: String = File(modelPath).name
  val accelerated: Boolean
  val loadMs: Int
  private val canvasBitmap = Bitmap.createBitmap(inputW, inputH, Bitmap.Config.ARGB_8888)
  private val canvas = Canvas(canvasBitmap)
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val pixels = IntArray(inputW * inputH)
  private val input = FloatArray(3 * inputW * inputH)

  init {
    val opts = OrtSession.SessionOptions()
    opts.setIntraOpNumThreads(4)
    var acc = false
    if (accelerate) {
      try { opts.addNnapi(); acc = true } catch (e: Exception) { android.util.Log.w("RTMW", "NNAPI unavailable, using CPU: $e") }
    }
    val t0 = SystemClock.elapsedRealtime()
    session = env.createSession(modelPath, opts)
    loadMs = (SystemClock.elapsedRealtime() - t0).toInt()
    inputName = session.inputNames.first()
    accelerated = acc
  }

  fun close() { try { session.close() } catch (_: Exception) {} }

  /** Run on one frame. `box` is xyxy in px of `bmp`. Returns 133 keypoints (px) and scores. */
  fun infer(bmp: Bitmap, box: RectF): Pair<Array<DoubleArray>, DoubleArray> {
    val cx = (box.left + box.right) / 2.0; val cy = (box.top + box.bottom) / 2.0
    var sw = (box.right - box.left) * 1.25; var sh = (box.bottom - box.top) * 1.25
    val aspect = inputW.toDouble() / inputH
    if (sw > sh * aspect) sh = sw / aspect else sw = sh * aspect
    val x0 = cx - sw / 2; val y0 = cy - sh / 2
    canvas.drawColor(Color.BLACK)
    val s = inputW / sw
    val m = Matrix(); m.setScale(s.toFloat(), s.toFloat()); m.postTranslate((-x0 * s).toFloat(), (-y0 * s).toFloat())
    canvas.drawBitmap(bmp, m, paint)
    canvasBitmap.getPixels(pixels, 0, inputW, 0, 0, inputW, inputH)
    val plane = inputW * inputH
    for (i in 0 until plane) {
      val c = pixels[i]
      val r = ((c shr 16) and 255).toFloat(); val g = ((c shr 8) and 255).toFloat(); val b = (c and 255).toFloat()
      input[i] = (b - mean[0]) / std[0]
      input[plane + i] = (g - mean[1]) / std[1]
      input[2 * plane + i] = (r - mean[2]) / std[2]
    }
    OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(1, 3, inputH.toLong(), inputW.toLong())).use { tensor ->
      session.run(mapOf(inputName to tensor)).use { out ->
        @Suppress("UNCHECKED_CAST")
        val sx = (out.get("simcc_x").get().value as Array<Array<FloatArray>>)[0]
        @Suppress("UNCHECKED_CAST")
        val sy = (out.get("simcc_y").get().value as Array<Array<FloatArray>>)[0]
        val K = sx.size
        val kps = Array(K) { DoubleArray(2) }
        val scores = DoubleArray(K)
        for (k in 0 until K) {
          var mx = -Float.MAX_VALUE; var ix = 0
          val rx = sx[k]; for (j in rx.indices) if (rx[j] > mx) { mx = rx[j]; ix = j }
          var my = -Float.MAX_VALUE; var iy = 0
          val ry = sy[k]; for (j in ry.indices) if (ry[j] > my) { my = ry[j]; iy = j }
          scores[k] = maxOf(0.0, ((mx + my) / 2).toDouble())
          val lx = ix / 2.0; val ly = iy / 2.0
          kps[k][0] = lx / inputW * sw + x0
          kps[k][1] = ly / inputH * sh + y0
        }
        return Pair(kps, scores)
      }
    }
  }
}
