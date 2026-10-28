/** Session feedback → per-exercise dosage multiplier (Phase 7): hard → −10 %, easy → +10 %, compounding
 *  over recent sessions, clamped to 0.7…1.3. Pure. */
export type SessionLike = { feedback: 'easy' | 'right' | 'hard' | null; exerciseIds: string[]; endedAt: number | null };

export function dosageFactors(sessions: SessionLike[], now = Date.now(), windowDays = 30): Record<string, number> {
  const out: Record<string, number> = {};
  const since = now - windowDays * 86400000;
  for (const s of sessions) {
    if (!s.feedback || s.feedback === 'right' || !s.endedAt || s.endedAt < since) continue;
    const step = s.feedback === 'easy' ? 1.1 : 0.9;
    for (const id of new Set(s.exerciseIds)) out[id] = Math.min(1.3, Math.max(0.7, (out[id] ?? 1) * step));
  }
  return out;
}
