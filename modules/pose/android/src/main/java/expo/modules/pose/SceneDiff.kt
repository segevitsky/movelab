package expo.modules.pose

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/** Phase 13 step 2 — per-sample picture change inside the crop (port of ios/SceneDiff.swift). */
object SceneDiff {
  class Result(val sampleFps: Double, val samples: List<DoubleArray>, val ms: Int)

  fun compute(context: Context, uri: Uri, crop: NormRect?, sampleFps: Double): Result {
    val t0 = SystemClock.elapsedRealtime()
    VideoFrames(context, uri, crop, 0.0).use { frames ->
      val gw = 96
      val gh = max(16, (frames.outHeight.toDouble() * gw / max(1, frames.outWidth)).toInt())
      val step = if (sampleFps > 0) max(1, (frames.info.nominalFps / sampleFps).roundToInt()) else 1
      val samples = ArrayList<DoubleArray>()
      var prev: FloatArray? = null
      var prevHist: FloatArray? = null
      var idx = 0
      while (true) {
        if (idx % step != 0) { if (frames.skip() == null) break; idx++; continue }
        val (t, bmp) = frames.next() ?: break
        idx++
        val g = Gray.of(bmp, gw, gh)
        val hist = FloatArray(32)
        for (v in g) hist[minOf(31, v.toInt() shr 3)] += 1f
        val n = g.size.toFloat()
        for (i in 0 until 32) hist[i] /= n
        val p = prev; val ph = prevHist
        if (p != null && ph != null) {
          var pix = 0f
          for (i in g.indices) pix += abs(g[i] - p[i])
          var hd = 0f
          for (i in 0 until 32) hd += abs(hist[i] - ph[i])
          samples.add(doubleArrayOf(t, (hd / 2).toDouble(), (pix / n).toDouble()))
        } else samples.add(doubleArrayOf(t, 0.0, 0.0))
        prev = g; prevHist = hist
      }
      return Result(sampleFps, samples, (SystemClock.elapsedRealtime() - t0).toInt())
    }
  }
}
