import { describe, expect, it } from 'vitest';
import { buildWorkoutPackage, describePackage, isWorkoutFileUrl, packageFileName, parseWorkoutPackage, WORKOUT_PACKAGE_VERSION } from './workoutPackage';
import type { Exercise, Source, Workout } from './schema';

const ex = (id: string, sourceId: string | null = null): Exercise => ({
  id, name: `ex ${id}`, aliases: [], pattern: null, slots: [], equipment: [], props: [], intensity: null, primaryMuscles: [], dosageDefault: null,
  repSeconds: null, notes: null, startPose: null, endPose: null, figure: 'AAAA', figureFps: 15, figureFrames: 10, loopStart: 0, loopEnd: 9,
  figure3d: null, scene: null, sourceId, createdAt: 1, updatedAt: 2, archived: false,
});
const src = (id: string): Source => ({ id, platform: 'instagram', url: `https://www.instagram.com/reel/${id}/`, coach: null, caption: null, ocrText: null, transcript: null, capturedAt: 1 });
const blocks = { blocks: [{ id: 'b1', name: 'Main', kind: 'sequence' as const, slots: [] }] };
const workout: Workout = {
  id: 'wo_1', frameworkId: 'fw_x', seed: 7, inputs: {}, items: [
    { blockId: 'b1', slotId: 's1', round: 0, exerciseId: 'a', dosage: { type: 'reps', value: 8 } },
    { blockId: 'b1', slotId: 's2', round: 0, exerciseId: 'b', dosage: { type: 'time', value: 30 } },
    { blockId: 'b1', slotId: 's1', round: 1, exerciseId: 'a', dosage: { type: 'reps', value: 8 } },
  ] as Workout['items'],
  why: null, favourite: true, blocks: null, name: 'Knee rehab · week 1', description: null, tags: null, createdAt: 5,
};

describe('workout package', () => {
  const pkg = buildWorkoutPackage({ workout, blocks, exercises: [ex('a', 'src_a'), ex('b'), ex('c', 'src_c')], sources: [src('src_a'), src('src_c')], sourceExercise: [{ sourceId: 'src_a', exerciseId: 'a', order: 0, startSec: null, endSec: null }, { sourceId: 'src_c', exerciseId: 'c', order: 0, startSec: null, endSec: null }], sender: '  Dana  ', now: 100 });

  it('carries only the exercises and sources the workout uses, with its sections embedded', () => {
    expect(pkg.exercises.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(pkg.sources.map((s) => s.id)).toEqual(['src_a']);
    expect(pkg.sourceExercise.map((se) => se.exerciseId)).toEqual(['a']);
    expect(pkg.workout.blocks).toEqual(blocks);
    expect(pkg.workout.frameworkId).toBe('built');
    expect(pkg.sender).toBe('Dana');
    expect(pkg.version).toBe(WORKOUT_PACKAGE_VERSION);
  });

  it('round-trips through JSON and describes itself', () => {
    const back = parseWorkoutPackage(JSON.stringify(pkg));
    expect(back.workout.id).toBe('wo_1');
    const d = describePackage(back);
    expect(d).toMatchObject({ name: 'Knee rehab · week 1', sections: 1, drills: 3, exercises: 2 });
    expect(d.drillNames).toEqual(['ex a', 'ex b']);
  });

  it('rejects files that are not workouts, newer formats and incomplete packages', () => {
    expect(() => parseWorkoutPackage('nope')).toThrow(/Not a MoveLab workout/);
    expect(() => parseWorkoutPackage(JSON.stringify({ app: 'movelab', version: 1, exercises: [] }))).toThrow(/Not a MoveLab workout/);
    expect(() => parseWorkoutPackage(JSON.stringify({ ...pkg, version: 99 }))).toThrow(/newer MoveLab/);
    expect(() => parseWorkoutPackage(JSON.stringify({ ...pkg, exercises: [ex('a')] }))).toThrow(/1 drill in this file has no exercise/);
  });

  it('names the file safely and recognises it', () => {
    expect(packageFileName('Knee rehab · week 1')).toBe('Knee-rehab-week-1.movelab');
    expect(packageFileName('חימום בוקר')).toBe('חימום-בוקר.movelab');
    expect(packageFileName(null)).toBe('workout.movelab');
    expect(isWorkoutFileUrl('file:///x/Knee-rehab.movelab')).toBe(true);
    expect(isWorkoutFileUrl('content://com.whatsapp.provider.media/item/42?x=1')).toBe(false);
    expect(isWorkoutFileUrl('https://www.instagram.com/reel/abc/')).toBe(false);
  });
});
