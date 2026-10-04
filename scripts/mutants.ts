import { Sim } from '../src/sim/simulation';
import { guideEvolution } from '../src/sim/powers';
import type { TraitKey } from '../src/sim/genome';
// Compare how long designed mutants survive under three ways of making them.
const result: Record<string, number[]> = { quickNoShelter: [], quick: [], lab: [] };
const stars: number[] = [];
const growths: number[] = [];
for (const seed of [1, 2, 3]) {
  for (const mode of ['quickNoShelter', 'quick', 'lab'] as const) {
    const sim = new Sim(seed, 'sandbox');
    for (let i = 0; i < 3500; i++) sim.step();
    const parents = sim.alive.filter((s) => s.kind === 'animal' && s.genome.tier >= 3 && s.established).sort((a, b) => b.totalPop - a.totalPop).slice(0, 4);
    const kids: number[] = [];
    for (const p of parents) {
      const key: TraitKey = p.genome.habitat === 'aquatic' ? 'speed' : 'horns';
      if (mode === 'lab') {
        const g = { ...p.genome, [key]: Math.min(1, p.genome[key] + 0.3) };
        const ranked = sim.regions.map((r) => ({ r, f: sim.forecast(g, r.cells, null, 5) })).filter((x) => x.f.habitable > 0).sort((a, b) => b.f.growth - a.f.growth);
        const best = ranked[0];
        stars.push(best.f.stars); growths.push(+best.f.growth.toFixed(3));
        const child = sim.createMutant(p, g, best.f.bestCell, 60);
        if (child) kids.push(child.id);
      } else {
        const res = guideEvolution(sim, p, key, 1);
        if (res.ok) {
          const child = sim.species[sim.species.length - 1];
          if (mode === 'quickNoShelter') { child.shelterUntil = -1; child.playerMade = false; }
          kids.push(child.id);
        }
      }
    }
    for (let i = 0; i < 300; i++) sim.step();
    for (const id of kids) if (!sim.species[id].alive) console.log(mode, 'died:', sim.species[id].deathCause.slice(0, 90));
    for (const id of kids) result[mode].push(sim.species[id].alive ? 300 : sim.species[id].diedTick - sim.species[id].bornTick);
  }
}
for (const [k, v] of Object.entries(result)) console.log(k.padEnd(15), `alive after 300 steps: ${v.filter((x) => x >= 300).length}/${v.length}`, ' lifetimes:', v.join(' '));
console.log('best-region stars for lab mutants:', stars.join(' '), ' growth', growths.join(' '));
