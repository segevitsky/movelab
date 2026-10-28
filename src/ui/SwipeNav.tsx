import React, { useRef } from 'react';
import { PanResponder, View, type ViewProps } from 'react-native';

/** Horizontal swipes on a full-screen area: left → onNext, right → onBack. Pure JS. */
export function SwipeNav({ children, onNext, onBack, style }: { children: React.ReactNode; onNext: () => void; onBack: () => void; style?: ViewProps['style'] }) {
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60 || g.vx < -0.8) onNext();
        else if (g.dx > 60 || g.vx > 0.8) onBack();
      },
    }),
  ).current;
  return <View style={style} {...pan.panHandlers}>{children}</View>;
}
