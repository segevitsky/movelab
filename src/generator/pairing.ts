import type { PairingEdge } from './types';

/** Rebuild the pairing graph from reel → exercises rows (Product spec §5): co-occurrence + order. */
export function buildPairings(sources: { sourceId: string; exerciseId: string; order: number }[]): PairingEdge[] {
  const bySource = new Map<string, { exerciseId: string; order: number }[]>();
  for (const r of sources) {
    if (!bySource.has(r.sourceId)) bySource.set(r.sourceId, []);
    bySource.get(r.sourceId)!.push(r);
  }
  const edges = new Map<string, PairingEdge>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const rows of bySource.values()) {
    rows.sort((a, b) => a.order - b.order);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i].exerciseId, b = rows[j].exerciseId;
        if (a === b) continue;
        const k = key(a, b);
        const e = edges.get(k) ?? { aId: a < b ? a : b, bId: a < b ? b : a, weight: 0, directedWeight: 0 };
        e.weight += 1;
        if (j === i + 1) e.directedWeight += a < b ? 1 : -1; // + means a→b in id order
        edges.set(k, e);
      }
    }
  }
  return [...edges.values()];
}

export function pairingWeight(edges: PairingEdge[], a: string, b: string): number {
  const e = edges.find((x) => (x.aId === a && x.bId === b) || (x.aId === b && x.bId === a));
  return e ? e.weight : 0;
}
