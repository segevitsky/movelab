/**
 * Phase 12 — guidance for a workout (pure TS). Advisory only: findings with a one-line fix, never a block.
 * Rules live in `RULES` so the owner can change what counts. Input is the workout's drills in play order
 * with the little metadata the report needs (pattern, slots, fingerprint).
 */
import { ALIKE_THRESHOLD, similarity, type Fingerprint } from './fingerprint';
import type { Pattern, Slot } from '../db/vocab';

export type ReportDrill = { id: string; name: string; sectionId: string; sectionName: string; pattern: Pattern | null; slots: Slot[]; fp: Fingerprint | null; seconds: number };

export type Finding = { level: 'warn' | 'info'; code: string; text: string; drillIds?: string[] };

export type Rules = {
  alikeThreshold: number;
  /** flag alike pairs inside the same section only (true) or anywhere in the workout (false) */
  alikeWithinSectionOnly: boolean;
  /** push:pull — warn when one side has ≥ this many more drills than the other */
  pushPullGap: number;
  wantCore: boolean;
  wantMobilityFirst: boolean;
  wantStretchLast: boolean;
  /** warn when a main section has fewer distinct patterns than this */
  minPatternsInMain: number;
};

export const RULES: Rules = { alikeThreshold: ALIKE_THRESHOLD, alikeWithinSectionOnly: false, pushPullGap: 2, wantCore: true, wantMobilityFirst: true, wantStretchLast: true, minPatternsInMain: 3 };

const short = (n: string) => n.replace(/\s*[·\-–]\s*@.*$/, '');
const UPPER: Pattern[] = ['push', 'pull'];
const LOWER: Pattern[] = ['squat', 'hinge', 'lunge'];

export function workoutReport(drills: ReportDrill[], rules: Rules = RULES): Finding[] {
  const out: Finding[] = [];
  // 1. alike pairs (motion) — the owner's main ask
  for (let i = 0; i < drills.length; i++) for (let j = i + 1; j < drills.length; j++) {
    const a = drills[i], b = drills[j];
    if (a.id === b.id) { out.push({ level: 'warn', code: 'same-drill', text: `${short(a.name)} appears twice`, drillIds: [a.id] }); continue; }
    if (!a.fp || !b.fp) continue;
    if (rules.alikeWithinSectionOnly && a.sectionId !== b.sectionId) continue;
    const s = similarity(a.fp, b.fp);
    if (s >= rules.alikeThreshold) out.push({ level: 'warn', code: 'alike', text: `${short(a.name)} and ${short(b.name)} move the same way (${Math.round(s * 100)} %) — keep one`, drillIds: [a.id, b.id] });
  }
  // 2. balance
  const pat = (p: Pattern) => drills.filter((d) => d.pattern === p).length;
  const push = pat('push'), pull = pat('pull');
  if (push + pull > 0 && Math.abs(push - pull) >= rules.pushPullGap) out.push({ level: 'info', code: 'push-pull', text: push > pull ? `${push} push vs ${pull} pull — add a pull` : `${pull} pull vs ${push} push — add a push` });
  const upper = drills.filter((d) => d.pattern && UPPER.includes(d.pattern)).length;
  const lower = drills.filter((d) => d.pattern && LOWER.includes(d.pattern)).length;
  if (upper + lower >= 3 && (upper === 0 || lower === 0)) out.push({ level: 'info', code: 'upper-lower', text: upper === 0 ? 'All lower body, no push or pull' : 'All upper body, no squat, hinge or lunge' });
  if (rules.wantCore && drills.length >= 4 && !drills.some((d) => d.pattern === 'core' || d.pattern === 'rotation' || d.slots.includes('core'))) out.push({ level: 'info', code: 'no-core', text: 'No core work today' });
  if (rules.wantMobilityFirst && drills.length >= 3) {
    const first = drills[0];
    if (!(first.pattern === 'mobility' || first.pattern === 'locomotion' || first.slots.includes('warmup') || first.slots.includes('mobility'))) out.push({ level: 'info', code: 'start-cold', text: `Starts with ${short(first.name)} — no mobility or warm-up first` });
  }
  if (rules.wantStretchLast && drills.length >= 4) {
    const last = drills[drills.length - 1];
    if (!(last.pattern === 'stretch' || last.pattern === 'mobility' || last.slots.includes('cooldown') || last.slots.includes('stretch'))) out.push({ level: 'info', code: 'no-cooldown', text: 'Ends without a stretch or cool-down' });
  }
  // 3. variety in the main section(s): the section with the most drills
  const bySection = new Map<string, ReportDrill[]>();
  for (const d of drills) bySection.set(d.sectionId, [...(bySection.get(d.sectionId) ?? []), d]);
  const main = [...bySection.values()].sort((a, b) => b.length - a.length)[0];
  if (main && main.length >= 4) {
    const patterns = new Set(main.map((d) => d.pattern).filter(Boolean));
    if (patterns.size < rules.minPatternsInMain) out.push({ level: 'info', code: 'low-variety', text: `${main[0].sectionName}: ${main.length} drills but only ${patterns.size} movement pattern${patterns.size === 1 ? '' : 's'}` });
  }
  return out;
}

/** One line for a header strip: the first warning, else the first info, else "balanced". */
export function reportSummary(findings: Finding[]): { text: string; level: 'warn' | 'info' | 'ok'; count: number } {
  const warn = findings.filter((f) => f.level === 'warn');
  if (warn.length) return { text: warn[0].text, level: 'warn', count: findings.length };
  if (findings.length) return { text: findings[0].text, level: 'info', count: findings.length };
  return { text: 'Looks balanced', level: 'ok', count: 0 };
}
