package expo.modules.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Sequential frame reader (port of ios/VideoFrames.swift): MediaMetadataRetriever → upright, cropped ARGB bitmaps.
 * Frames are fetched in small batches (`getFramesAtIndex`, API 28) so the decoder runs forward instead of seeking;
 * the rotation metadata is honoured (the retriever already applies it; we verify by the bitmap's orientation) and
 * the crop is applied so landmark pixel coordinates refer to the *output* image.
 */
class VideoFrames(context: Context, uri: Uri, normCrop: NormRect?, maxSeconds: Double) : AutoCloseable {
  data class Info(val duration: Double, val nominalFps: Double, val width: Int, val height: Int, val frameCount: Int)

  private val mmr = MediaMetadataRetriever()
  val info: Info
  val crop: Rect?
  val outWidth: Int
  val outHeight: Int
  private val lastIndex: Int
  private var index = 0
  private var batchStart = -1
  private var batch: List<Bitmap> = emptyList()
  private val batchSize = 8

  init {
    mmr.setDataSource(context, uri)
    val w0 = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: throw PoseException("no video track")
    val h0 = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: throw PoseException("no video track")
    val rotation = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
    val durationMs = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    val duration = durationMs / 1000.0
    val count = if (Build.VERSION.SDK_INT >= 28) mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull() ?: 0 else 0
    val captureFps = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toDoubleOrNull() ?: 0.0
    val fps = when {
      count > 1 && duration > 0 -> count / duration
      captureFps > 0 -> captureFps
      else -> 30.0
    }
    val frameCount = if (count > 0) count else max(1, (duration * fps).toInt())
    val rotated = rotation == 90 || rotation == 270
    val w = if (rotated) h0 else w0
    val h = if (rotated) w0 else h0
    info = Info(duration, fps, w, h, frameCount)

    if (normCrop != null && !normCrop.isFull) {
      val x = max(0.0, min(w.toDouble(), normCrop.x * w))
      val y = max(0.0, min(h.toDouble(), normCrop.y * h))
      val cw = max(2.0, min(w - x, normCrop.width * w))
      val ch = max(2.0, min(h - y, normCrop.height * h))
      val r = Rect(floor(x).toInt(), floor(y).toInt(), 0, 0)
      r.right = r.left + (floor(cw / 2) * 2).toInt()
      r.bottom = r.top + (floor(ch / 2) * 2).toInt()
      crop = r
      outWidth = r.width(); outHeight = r.height()
    } else {
      crop = null; outWidth = w; outHeight = h
    }
    lastIndex = if (maxSeconds > 0) min(frameCount - 1, (maxSeconds * fps).toInt()) else frameCount - 1
  }

  override fun close() { batch = emptyList(); try { mmr.release() } catch (_: Exception) {} }

  /** Presentation time of frame `i` (frames are assumed evenly spaced, as MediaMetadataRetriever indexes them). */
  private fun timeOf(i: Int) = i / info.nominalFps

  /** Next frame as (seconds, upright + cropped ARGB_8888 bitmap), or null at EOF. */
  fun next(): Pair<Double, Bitmap>? {
    if (index > lastIndex) return null
    val bmp = fetch(index) ?: return null
    val t = timeOf(index)
    index++
    return Pair(t, transform(bmp))
  }

  fun skip(): Double? {
    if (index > lastIndex) return null
    val t = timeOf(index)
    index++
    return t
  }

  private fun fetch(i: Int): Bitmap? {
    if (Build.VERSION.SDK_INT >= 28) {
      if (batchStart < 0 || i < batchStart || i >= batchStart + batch.size) {
        val n = min(batchSize, lastIndex - i + 1)
        if (n <= 0) return null
        batch = try {
          if (Build.VERSION.SDK_INT >= 30) {
            val params = MediaMetadataRetriever.BitmapParams().apply { preferredConfig = Bitmap.Config.ARGB_8888 }
            mmr.getFramesAtIndex(i, n, params)
          } else mmr.getFramesAtIndex(i, n)
        } catch (e: Exception) { emptyList() }
        batchStart = i
        if (batch.isEmpty()) return null
      }
      val k = i - batchStart
      return if (k < batch.size) batch[k] else null
    }
    // pre-28: seek per frame (slow but correct)
    return mmr.getFrameAtTime((timeOf(i) * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST)
  }

  private fun transform(src: Bitmap): Bitmap {
    var bmp = src
    // the retriever applies the rotation metadata; if a decoder did not, the bitmap is the un-rotated size
    if ((bmp.width != info.width || bmp.height != info.height) && bmp.width == info.height && bmp.height == info.width) {
      val m = Matrix(); m.postRotate(90f)
      bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    }
    if (bmp.config != Bitmap.Config.ARGB_8888) bmp = bmp.copy(Bitmap.Config.ARGB_8888, false)
    val c = crop ?: return bmp
    val x = min(c.left, bmp.width - 2)
    val y = min(c.top, bmp.height - 2)
    val w = min(c.width(), bmp.width - x)
    val h = min(c.height(), bmp.height - y)
    return Bitmap.createBitmap(bmp, x, y, w, h)
  }

  companion object {
    /** One upright, cropped frame as a JPEG file in the cache dir (debug overlay / Review thumbnails). */
    fun jpeg(context: Context, uri: Uri, seconds: Double, normCrop: NormRect?, maxSide: Double): Triple<Uri, Int, Int> {
      val mmr = MediaMetadataRetriever()
      try {
        mmr.setDataSource(context, uri)
        var bmp = mmr.getFrameAtTime((seconds * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST) ?: throw PoseException("no frame at $seconds s")
        val w = bmp.width
        val h = bmp.height
        if (normCrop != null && !normCrop.isFull) {
          val x = max(0, (normCrop.x * w).toInt())
          val y = max(0, (normCrop.y * h).toInt())
          val cw = min(w - x, (normCrop.width * w).toInt())
          val ch = min(h - y, (normCrop.height * h).toInt())
          if (cw > 1 && ch > 1) bmp = Bitmap.createBitmap(bmp, x, y, cw, ch)
        }
        if (maxSide > 0) {
          val s = min(1.0, maxSide / max(bmp.width, bmp.height))
          if (s < 1) bmp = Bitmap.createScaledBitmap(bmp, max(1, (bmp.width * s).toInt()), max(1, (bmp.height * s).toInt()), true)
        }
        val out = File(context.cacheDir, "frame-${(seconds * 1000).toInt()}-${System.nanoTime() % 1000000}.jpg")
        FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        return Triple(Uri.fromFile(out), bmp.width, bmp.height)
      } finally { try { mmr.release() } catch (_: Exception) {} }
    }
  }
}
