package expo.modules.pose

import android.content.Context
import android.graphics.PointF
import android.graphics.RectF
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.SystemClock
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Architecture §5a — auto-crop of the moving area + floor-mat quad + camera-static flag, on a ≈160 px gray raster.
 * Port of ios/SceneAnalysis.swift (same thresholds).
 */
object SceneAnalysis {
  class Result(val width: Int, val height: Int, val cropRect: RectF?, val matQuad: List<PointF>?, val cameraStatic: Boolean, val samples: Int, val ms: Int)
  private class Box(var minX: Int, var minY: Int, var maxX: Int, var maxY: Int)

  fun analyze(context: Context, uri: Uri, sampleFps: Double = 2.0, maxSamples: Int = 60): Result {
    val t0 = SystemClock.elapsedRealtime()
    val mmr = MediaMetadataRetriever()
    val rasters = ArrayList<FloatArray>()
    val W: Int; val H: Int; val gw = 160; val gh: Int
    try {
      mmr.setDataSource(context, uri)
      val w0 = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: throw PoseException("no video track")
      val h0 = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: throw PoseException("no video track")
      val rot = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val dur = (mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000.0
      W = if (rot == 90 || rot == 270) h0 else w0
      H = if (rot == 90 || rot == 270) w0 else h0
      gh = max(16, (H.toDouble() * gw / W).toInt())
      val n = max(2, min(maxSamples, (dur * sampleFps).toInt()))
      for (i in 0 until n) {
        val t = dur * (i + 0.5) / n
        val bmp = mmr.getFrameAtTime((t * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: continue
        rasters.add(Gray.of(bmp, gw, gh))
        bmp.recycle()
      }
    } finally { try { mmr.release() } catch (_: Exception) {} }
    if (rasters.size < 2) throw PoseException("could not sample frames")
    val count = gw * gh
    val std = FloatArray(count); val medianBg = FloatArray(count)
    val col = FloatArray(rasters.size)
    for (p in 0 until count) {
      var s = 0f
      for (r in rasters.indices) { col[r] = rasters[r][p]; s += col[r] }
      val m = s / rasters.size
      var v = 0f
      for (r in rasters.indices) { val d = col[r] - m; v += d * d }
      std[p] = sqrt(v / rasters.size)
      col.sort()
      medianBg[p] = col[col.size / 2]
    }
    val stdSorted = std.copyOf(); stdSorted.sort()
    val stdThr = max(4f, stdSorted[(count * 0.6).toInt()])
    val moving = BooleanArray(count) { std[it] > stdThr }
    val movingFrac = moving.count { it }.toFloat() / count
    var cropRect: RectF? = null
    val box = largestComponentBox(moving, gw, gh)
    if (box != null && movingFrac < 0.85f) {
      val x0 = max(0, box.minX - 2); val y0 = max(0, box.minY - 2)
      val x1 = min(gw, box.maxX + 2); val y1 = min(gh, box.maxY + 2)
      val area = ((x1 - x0) * (y1 - y0)).toDouble() / count
      if (area > 0.1) cropRect = RectF(x0.toFloat() / gw, y0.toFloat() / gh, x1.toFloat() / gw, y1.toFloat() / gh)
    }
    var staticScore = 0f; var cnt = 0
    for (p in 0 until count) if (!moving[p]) { staticScore += std[p]; cnt++ }
    val cameraStatic = cnt != 0 && (staticScore / cnt) < 6f
    var matQuad: List<PointF>? = null
    if (cameraStatic) {
      val cx0 = ((cropRect?.left ?: 0f) * gw).toInt(); val cy0 = ((cropRect?.top ?: 0f) * gh).toInt()
      val cx1 = ((cropRect?.right ?: 1f) * gw).toInt(); val cy1 = ((cropRect?.bottom ?: 1f) * gh).toInt()
      matQuad = detectMat(medianBg, gw, gh, cx0, cy0, cx1, cy1)?.map { PointF(((it.x + 0.5) * W / gw).toFloat(), ((it.y + 0.5) * H / gh).toFloat()) }
    }
    return Result(W, H, cropRect, matQuad, cameraStatic, rasters.size, (SystemClock.elapsedRealtime() - t0).toInt())
  }

  private fun largestComponentBox(mask: BooleanArray, w: Int, h: Int): Box? {
    val seen = BooleanArray(w * h)
    var bestArea = -1; var best: Box? = null
    val stack = ArrayDeque<Int>()
    for (s in 0 until w * h) {
      if (!mask[s] || seen[s]) continue
      var area = 0
      val b = Box(s % w, s / w, s % w, s / w)
      stack.addLast(s); seen[s] = true
      while (stack.isNotEmpty()) {
        val p = stack.removeLast()
        area++
        val x = p % w; val y = p / w
        b.minX = min(b.minX, x); b.maxX = max(b.maxX, x); b.minY = min(b.minY, y); b.maxY = max(b.maxY, y)
        for ((dx, dy) in NEIGHBOURS) {
          val nx = x + dx; val ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          val q = ny * w + nx
          if (mask[q] && !seen[q]) { seen[q] = true; stack.addLast(q) }
        }
      }
      if (area > bestArea) { bestArea = area; best = b }
    }
    val b = best ?: return null
    return Box(b.minX, b.minY, b.maxX + 1, b.maxY + 1)
  }

  private val NEIGHBOURS = listOf(Pair(1, 0), Pair(-1, 0), Pair(0, 1), Pair(0, -1))

  private fun detectMat(bg: FloatArray, w: Int, h: Int, x0: Int, y0: Int, x1: Int, y1: Int): List<PointF>? {
    val rw = x1 - x0; val rh = y1 - y0
    if (rw <= 8 || rh <= 8) return null
    val edge = FloatArray(w * h)
    for (y in 1 until h - 1) for (x in 1 until w - 1) {
      val i = y * w + x
      val gx = -bg[i - w - 1] - 2 * bg[i - 1] - bg[i + w - 1] + bg[i - w + 1] + 2 * bg[i + 1] + bg[i + w + 1]
      val gy = -bg[i - w - 1] - 2 * bg[i - w] - bg[i - w + 1] + bg[i + w - 1] + 2 * bg[i + w] + bg[i + w + 1]
      edge[i] = sqrt(gx * gx + gy * gy)
    }
    val vals = ArrayList<Float>()
    for (y in (y0 + rh * 45 / 100) until y1) for (x in x0 until x1) vals.add(bg[y * w + x])
    if (vals.size <= 16) return null
    vals.sort()
    val dark = vals[vals.size / 4]
    val core = BooleanArray(w * h)
    for (y in (y0 + rh * 45 / 100) until y1) for (x in x0 until x1) { val i = y * w + x; core[i] = bg[i] <= dark && edge[i] < 40f }
    val cb = largestComponentBox(core, w, h) ?: return null
    val coreArea = (cb.maxX - cb.minX) * (cb.maxY - cb.minY)
    if (coreArea < rw * rh / 25) return null
    val seedX = (cb.minX + cb.maxX) / 2; val seedY = (cb.minY + cb.maxY) / 2
    val seedVal = bg[seedY * w + seedX]
    val region = BooleanArray(w * h)
    val stack = ArrayDeque<Int>(); stack.addLast(seedY * w + seedX); region[seedY * w + seedX] = true
    val pts = ArrayList<IntArray>()
    while (stack.isNotEmpty()) {
      val p = stack.removeLast()
      val x = p % w; val y = p / w
      pts.add(intArrayOf(x, y))
      for ((dx, dy) in NEIGHBOURS) {
        val nx = x + dx; val ny = y + dy
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue
        val q = ny * w + nx
        if (region[q] || edge[q] > 60f || abs(bg[q] - seedVal) > 45f) continue
        region[q] = true; stack.addLast(q)
      }
    }
    val area = pts.size
    if (area < rw * rh * 8 / 100 || area > rw * rh * 55 / 100) return null
    val minY = pts.minOf { it[1] }; val maxY = pts.maxOf { it[1] }
    if (minY < y0 + rh * 40 / 100) return null
    if ((maxY - minY) > rh * 55 / 100) return null
    fun extreme(score: (IntArray) -> Int): PointF { val p = pts.maxByOrNull(score)!!; return PointF(p[0].toFloat(), p[1].toFloat()) }
    val tl = extreme { -(it[0] + it[1]) }
    val tr = extreme { it[0] - it[1] }
    val br = extreme { it[0] + it[1] }
    val bl = extreme { -it[0] + it[1] }
    if (!(tl.y < bl.y && tr.y < br.y && tl.x < tr.x && bl.x < br.x)) return null
    return listOf(tl, tr, br, bl)
  }
}
