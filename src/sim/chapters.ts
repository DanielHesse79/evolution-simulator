import { isAuto, type Genome } from './genome';
import type { Sim } from './simulation';
import { N } from './world';
import { MAXS } from './simulation';

export type ChapterId = 'spark' | 'shore' | 'flight' | 'warmth' | 'mind';
export interface ChapterSubject {
  speciesId: number;
  name: string;
  genome: Genome;
  hue: number;
  cell: number;
}
export interface ChapterRecord extends ChapterSubject { id: ChapterId; year: number; tick: number }
export interface ChapterCandidate extends ChapterSubject { established: boolean; landCells: number; landShare: number }

/** Narrative body-plan proxies, not a taxonomic or consciousness classifier. */
export function eligibleChapters(c: ChapterCandidate): ChapterId[] {
  const g = c.genome;
  if (!c.established || g.tier < 2 || isAuto(g)) return [];
  const onLand = g.habitat !== 'aquatic' && c.landCells >= 3 && c.landShare >= 0.6;
  if (!onLand) return [];
  const out: ChapterId[] = ['shore'];
  if (g.flight > 0.5) out.push('flight');
  // Fur alone is not enough: a terrestrial advanced, insulated and social body plan.
  // Lactation is illustrated by the recording, but is not simulated (see docs/chapters.md).
  if (g.tier >= 4 && g.fur > 0.5 && g.social > 0.25) out.push('warmth');
  if (g.tier >= 4 && g.fur > 0.4 && g.grasp > 0.5 && g.social > 0.5 && g.intel > 0.7 && g.flight < 0.35 && g.size < 8.3) out.push('mind');
  return out;
}

/** A chapter is recorded once, after the same lineage qualifies for 32 sampled episode steps. */
export class ChapterBook {
  readonly records = new Map<ChapterId, ChapterRecord>();
  private since = new Map<string, number>();
  private lastTick = -1;
  constructor(first: ChapterSubject) {
    this.records.set('spark', { ...first, genome: { ...first.genome }, id: 'spark', year: 0, tick: 0 });
  }
  observe(candidates: ChapterCandidate[], tick: number, year: number): ChapterRecord[] {
    if (tick <= this.lastTick) return [];
    this.lastTick = tick;
    const present = new Set<string>();
    const added: ChapterRecord[] = [];
    for (const c of candidates) for (const id of eligibleChapters(c)) {
      if (this.records.has(id)) continue;
      const key = `${id}:${c.speciesId}`;
      present.add(key);
      const start = this.since.get(key) ?? tick;
      this.since.set(key, start);
      if (tick - start < 32) continue;
      const record = { ...c, genome: { ...c.genome }, id, tick, year };
      this.records.set(id, record);
      added.push(record);
    }
    for (const key of this.since.keys()) if (!present.has(key)) this.since.delete(key);
    return added;
  }
}

/** Observe populations without consuming simulation randomness or altering their evolution. */
export function chapterCandidates(sim: Sim): ChapterCandidate[] {
  const out: ChapterCandidate[] = [];
  for (const sp of sim.alive) {
    if (!sp.established || sp.kind !== 'animal' || sp.genome.habitat === 'aquatic') continue;
    let landCells = 0, land = 0, total = 0, best = 0, cell = -1;
    for (let c = 0; c < N; c++) {
      const p = sim.pop[c * MAXS + sp.slot];
      total += p;
      if (!sim.world.isWater[c] && p > 0.1) {
        landCells++;
        land += p;
        if (p > best) { best = p; cell = c; }
      }
    }
    out.push({ speciesId: sp.id, name: sp.name, genome: sp.genome, hue: sp.hue, cell,
      established: sp.established, landCells, landShare: total > 0 ? land / total : 0 });
  }
  return out;
}
