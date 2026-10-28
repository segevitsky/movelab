import { processCapture, type RawFrame } from '../pipeline';
import type { Db } from './index';
import { exerciseFromProcessed, insertExercise, linkSource } from './repo';
import type { Equipment, Pattern, Slot } from './vocab';

/** Dev-only: turn the 3 lab reels into library exercises (with figures) so the grid can be tested. */
export async function importLabReels(db: Db) {
  const reels: { name: string; url: string; coach: string; frames: RawFrame[]; segs: { name: string; pattern: Pattern; slots: Slot[]; equipment: Equipment[] }[] }[] = [
    {
      name: 'mobility', url: 'https://www.instagram.com/reel/lab-reel-1/', coach: 'lab.mobility',
      frames: require('../../reference/sample-data/reel1_mobility_mp33.json'),
      segs: [
        { name: 'Standing flow', pattern: 'mobility', slots: ['warmup', 'mobility'], equipment: [] },
        { name: 'Seated flow', pattern: 'mobility', slots: ['mobility', 'cooldown'], equipment: ['mat'] },
        { name: 'Lunge flow', pattern: 'lunge', slots: ['mobility', 'legs'], equipment: ['mat'] },
      ],
    },
    {
      name: 'staff', url: 'https://www.instagram.com/reel/lab-reel-2/', coach: 'lab.staff',
      frames: require('../../reference/sample-data/reel2_staff_mp33.json'),
      segs: [{ name: 'Staff flow', pattern: 'skill', slots: ['skill', 'warmup'], equipment: ['staff'] }],
    },
    {
      name: 'burpee', url: 'https://www.instagram.com/reel/lab-reel-3/', coach: 'lab.burpee',
      frames: require('../../reference/sample-data/reel3_burpee_mp33.json'),
      segs: [{ name: 'Burpee lunge', pattern: 'cardio', slots: ['cardio', 'legs'], equipment: [] }],
    },
  ];
  let count = 0;
  for (const r of reels) {
    const processed = processCapture({ frames: r.frames });
    const ids: string[] = [];
    processed.forEach((seg, i) => {
      const meta = r.segs[Math.min(i, r.segs.length - 1)];
      const row = exerciseFromProcessed(seg, { name: meta.name, pattern: meta.pattern, slots: meta.slots, equipment: meta.equipment, intensity: 'medium', dosageDefault: seg.period?.periodic ? { type: 'reps', value: 8 } : { type: 'time', value: 45 } });
      ids.push(row.id);
      insertExercise(db, row).then(() => count++);
    });
    await linkSource(db, { url: r.url, coach: r.coach, exerciseIds: ids, ranges: processed.map((s) => ({ startSec: s.segment.t0, endSec: s.segment.t1 })) });
  }
  return count;
}
