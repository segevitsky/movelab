import { describe, expect, it } from 'vitest';
import type { Fingerprint } from './fingerprint';
import { reportSummary, workoutReport, type ReportDrill } from './report';

const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  orientation: [1, 0, 0], hipHeight: 0.7,
  angles: { elbow: { mean: 0.8, range: 0.1 }, shoulder: { mean: 0.2, range: 0.1 }, hip: { mean: 0.9, range: 0.1 }, knee: { mean: 0.9, range: 0.2 } },
  energy: { arms: 0.3, legs: 0.5, torso: 0.2 }, speed: 0.3, contacts: { hands: 0, feet: 1 }, seconds: 0.5, frames: 30, ...over,
});
const d = (id: string, pattern: ReportDrill['pattern'], o: Partial<ReportDrill> = {}): ReportDrill => ({ id, name: `${id} · @coach`, sectionId: 'main', sectionName: 'Rounds', pattern, slots: [], fp: fp(), seconds: 45, ...o });

describe('workout report', () => {
  it('flags drills that move the same way, with a one-line fix', () => {
    const f = workoutReport([d('Pull 1', 'pull'), d('Mobility 1', 'mobility')]);
    const alike = f.find((x) => x.code === 'alike');
    expect(alike?.text).toMatch(/Pull 1 and Mobility 1 move the same way/);
    expect(alike?.drillIds).toEqual(['Pull 1', 'Mobility 1']);
  });

  it('does not flag clearly different motions', () => {
    const floor = fp({ orientation: [0, 1, 0], hipHeight: 0.1, contacts: { hands: 1, feet: 1 }, energy: { arms: 0.6, legs: 0.2, torso: 0.2 } });
    const f = workoutReport([d('Squat', 'squat'), d('Push-up', 'push', { fp: floor })]);
    expect(f.find((x) => x.code === 'alike')).toBeUndefined();
  });

  it('reports push/pull imbalance, missing core and a cold start', () => {
    const f = workoutReport([d('Push 1', 'push'), d('Push 2', 'push', { fp: fp({ orientation: [0, 1, 0] }) }), d('Push 3', 'push', { fp: fp({ hipHeight: 0.1, contacts: { hands: 1, feet: 0 } }) }), d('Squat', 'squat', { fp: fp({ speed: 0.9 }) })]);
    const codes = f.map((x) => x.code);
    expect(codes).toContain('push-pull');
    expect(codes).toContain('no-core');
    expect(codes).toContain('start-cold');
    expect(f.find((x) => x.code === 'push-pull')?.text).toMatch(/add a pull/);
  });

  it('summarises: first warning wins, otherwise "Looks balanced"', () => {
    expect(reportSummary([]).text).toBe('Looks balanced');
    expect(reportSummary([{ level: 'info', code: 'x', text: 'info' }, { level: 'warn', code: 'alike', text: 'warn' }]).level).toBe('warn');
  });
});
