import React, { useCallback, useEffect, useRef } from 'react';
import { FlatList, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * Native horizontal paging, one page per item (swipe = next/previous, handled by the OS, so it cannot be
 * swallowed by other touch handlers). `index` is controlled: arrows set it and the pager scrolls; a swipe
 * reports the new page through `onIndex`. Only the active page should animate (see `active`).
 */
export function DrillPager<T>({ items, index, onIndex, keyOf, render }: {
  items: T[];
  index: number;
  onIndex: (i: number) => void;
  keyOf: (item: T, i: number) => string;
  render: (item: T, i: number, active: boolean) => React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<T>>(null);
  const page = useRef(index);
  useEffect(() => {
    if (page.current === index) return;
    page.current = index;
    list.current?.scrollToIndex({ index, animated: true });
  }, [index]);
  const onEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (p !== page.current) { page.current = p; onIndex(p); }
  }, [items.length, width, onIndex]);
  return (
    <FlatList
      ref={list}
      data={items}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      keyExtractor={keyOf}
      initialScrollIndex={Math.min(index, Math.max(0, items.length - 1))}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      onMomentumScrollEnd={onEnd}
      onScrollToIndexFailed={() => {}}
      initialNumToRender={1}
      windowSize={3}
      maxToRenderPerBatch={2}
      removeClippedSubviews
      renderItem={({ item, index: i }) => <>{render(item, i, i === index)}</>}
      style={{ flex: 1 }}
    />
  );
}
