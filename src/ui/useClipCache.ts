import { useMemo, useRef } from 'react';
import type { Exercise } from '../db/schema';
import { clipFromExercise } from '../db/repo';
import type { FigureClip } from '../figure/prepare';

/** Stable FigureClip objects per exercise (keyed by id + figure blob), so thumbnails don't re-record on every render. */
export function useClipCache(exercises: Exercise[] | undefined) {
  const cache = useRef(new Map<string, { key: string; clip: FigureClip | null }>());
  return useMemo(() => {
    const get = (ex: Exercise | undefined): FigureClip | null => {
      if (!ex) return null;
      const key = `${ex.figure?.length ?? 0}:${ex.updatedAt}:${JSON.stringify(ex.scene ?? null)}`;
      const hit = cache.current.get(ex.id);
      if (hit && hit.key === key) return hit.clip;
      const clip = clipFromExercise(ex);
      cache.current.set(ex.id, { key, clip });
      return clip;
    };
    return { get };
  }, [exercises]);
}
