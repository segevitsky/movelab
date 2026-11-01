import React, { useRef } from 'react';
import { PanResponder, View, type ViewProps } from 'react-native';

/**
 * Horizontal swipes on an area: swipe left → onNext, swipe right → onBack. Pure JS (PanResponder).
 * Claims the gesture in the capture phase once the finger has clearly moved sideways, so it works over
 * child Pressables and the Skia canvas alike; taps still reach the children.
 * (The app forces LTR layout — see app/_layout.tsx — so no direction mirroring here. When Hebrew layout
 * ships, mirror together with the layout, not before.)
 */
export function SwipeNav({ children, onNext, onBack, style }: { children: React.ReactNode; onNext: () => void; onBack: () => void; style?: ViewProps['style'] }) {
  const cb = useRef({ onNext, onBack });
  cb.current = { onNext, onBack };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60 || g.vx < -0.8) cb.current.onNext();
        else if (g.dx > 60 || g.vx > 0.8) cb.current.onBack();
      },
    }),
  ).current;
  return <View style={style} {...pan.panHandlers}>{children}</View>;
}
