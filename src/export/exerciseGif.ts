/**
 * Export an exercise's looping figure as an animated GIF and hand it to the iOS share sheet
 * (save to Photos, AirDrop, WhatsApp…). Rendering is the same Skia drawFrame as the cards, offscreen.
 * Skeleton-only: no video or image of the source is involved.
 */
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { drawFrame } from '../figure/draw';
import { prepare, type FigureClip } from '../figure/prepare';
import { encodeGif, type RgbaFrame } from './gif';

export type GifOptions = {
  /** output width in px (height follows the card aspect 1.1) */
  width?: number;
  /** output frame rate; the clip is resampled to it */
  fps?: number;
  mirror?: boolean;
  /** progress 0..1 (frames rendered + encoded) */
  onProgress?: (p: number) => void;
};

/** Render the clip's loop window to RGBA frames. */
export function renderLoopFrames(clip: FigureClip, width: number, height: number, fps: number, mirror = false, onProgress?: (p: number) => void): { frames: RgbaFrame[]; delayMs: number } {
  const prep = prepare(clip, width, height);
  const { i0, i1 } = prep.loop;
  const n = i1 - i0 + 1;
  const step = Math.max(1, prep.fps / fps);
  const count = Math.max(1, Math.round(n / step));
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Could not create an offscreen surface');
  const canvas = surface.getCanvas();
  const frames: RgbaFrame[] = [];
  for (let j = 0; j < count; j++) {
    const k = i0 + Math.min(n - 1, Math.round(j * step));
    canvas.clear(Skia.Color('#f6f3ee'));
    drawFrame(canvas, prep, k, { mirror, background: true });
    surface.flush();
    const img = surface.makeImageSnapshot();
    const px = img.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    img.dispose();
    if (!px || !(px instanceof Uint8Array)) throw new Error('Could not read pixels');
    frames.push(px);
    onProgress?.((j + 1) / count * 0.6);
  }
  surface.dispose();
  return { frames, delayMs: 1000 / (prep.fps / step) };
}

/** Build the GIF file for an exercise and return its path. */
export async function exerciseGifFile(name: string, clip: FigureClip, opts: GifOptions = {}): Promise<File> {
  const width = opts.width ?? 320;
  const height = Math.round(width * 1.1);
  const { frames, delayMs } = renderLoopFrames(clip, width, height, opts.fps ?? 15, opts.mirror, opts.onProgress);
  const bytes = encodeGif(frames, width, height, delayMs);
  opts.onProgress?.(0.95);
  const safe = name.replace(/[^\w֐-׿-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'exercise';
  const file = new File(Paths.cache, `${safe}.gif`);
  if (file.exists) file.delete();
  file.write(bytes);
  opts.onProgress?.(1);
  return file;
}

/** Export + open the share sheet. Resolves when the sheet closes. */
export async function shareExerciseGif(name: string, clip: FigureClip, opts: GifOptions = {}) {
  const file = await exerciseGifFile(name, clip, opts);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'image/gif', UTI: 'com.compuserve.gif', dialogTitle: name });
}
