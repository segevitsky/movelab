package expo.modules.pose

import android.graphics.Bitmap
import kotlin.math.pow

/** Small linear-gray rasters (the iOS side draws into a linearGray CGColorSpace; match it with an sRGB → linear LUT). */
object Gray {
  private val lut = FloatArray(256) { i -> val c = i / 255.0; (if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)).toFloat() * 255f }

  fun of(src: Bitmap, w: Int, h: Int): FloatArray {
    val bmp = if (src.width == w && src.height == h) src else Bitmap.createScaledBitmap(src, w, h, true)
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    val out = FloatArray(w * h)
    for (i in px.indices) {
      val c = px[i]
      out[i] = 0.2126f * lut[(c shr 16) and 255] + 0.7152f * lut[(c shr 8) and 255] + 0.0722f * lut[c and 255]
    }
    if (bmp !== src) bmp.recycle()
    return out
  }
}
