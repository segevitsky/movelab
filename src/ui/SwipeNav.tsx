import React from 'react';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

/** Horizontal flings: left → onNext, right → onBack (player). */
export function SwipeNav({ children, onNext, onBack }: { children: React.ReactNode; onNext: () => void; onBack: () => void }) {
  const left = Gesture.Fling().direction(Directions.LEFT).onEnd(() => { runOnJS(onNext)(); });
  const right = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => { runOnJS(onBack)(); });
  return <GestureDetector gesture={Gesture.Exclusive(left, right)}>{children as React.ReactElement}</GestureDetector>;
}
