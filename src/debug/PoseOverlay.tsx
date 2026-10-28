import React from 'react';
import { Canvas, Circle, Image, Line, useImage, vec, Rect } from '@shopify/react-native-skia';
import type { PoseFrame } from '../../modules/pose';
import { FEET, LEFT, MP_BONES } from './skeleton';

type Props = {
  imageUri: string | null;
  imageW: number;
  imageH: number;
  frame: PoseFrame | null;
  /** Size of the image the landmarks were measured in (the pose result's width/height). */
  srcW: number;
  srcH: number;
  width: number;
  height: number;
  minVis?: number;
};

/** Draws one video frame and the raw 33 landmarks on top (fit: contain). */
export function PoseOverlay({ imageUri, imageW, imageH, frame, srcW, srcH, width, height, minVis = 0.3 }: Props) {
  const img = useImage(imageUri);
  const s = imageW && imageH ? Math.min(width / imageW, height / imageH) : 1;
  const ox = (width - imageW * s) / 2;
  const oy = (height - imageH * s) / 2;
  // landmarks are in srcW×srcH pixels; the preview JPEG may be a downscaled copy
  const kx = srcW > 0 ? (imageW / srcW) * s : s;
  const ky = srcH > 0 ? (imageH / srcH) * s : s;
  const P = (i: number) => {
    const p = frame?.xy?.[i];
    if (!p) return null;
    const v = frame?.v?.[i] ?? 1;
    if (v < minVis) return null;
    return vec(ox + p[0] * kx, oy + p[1] * ky);
  };
  return (
    <Canvas style={{ width, height, backgroundColor: '#111' }}>
      <Rect x={0} y={0} width={width} height={height} color="#111" />
      {img && <Image image={img} x={ox} y={oy} width={imageW * s} height={imageH * s} fit="fill" />}
      {frame?.xy &&
        MP_BONES.map(([a, b]) => {
          const pa = P(a);
          const pb = P(b);
          if (!pa || !pb) return null;
          const left = LEFT.has(a) && LEFT.has(b);
          return <Line key={`${a}-${b}`} p1={pa} p2={pb} color={left ? '#ff9f1c' : '#2ec4ff'} strokeWidth={3} />;
        })}
      {frame?.xy &&
        frame.xy.map((_, i) => {
          const p = P(i);
          if (!p) return null;
          const foot = FEET.has(i);
          return <Circle key={i} cx={p.x} cy={p.y} r={foot ? 6 : 4} color={foot ? '#7CFC00' : LEFT.has(i) ? '#ff9f1c' : '#2ec4ff'} />;
        })}
    </Canvas>
  );
}
