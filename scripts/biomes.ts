// Share of the land in each landscape type after a full run, and which plants dominate.
//   npx tsx scripts/biomes.ts [seed ...]
import { Sim, TOTAL_TICKS, MAXS } from '../src/sim/simulation';
import { N } from '../src/sim/world';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const w = sim.world;
  const count = new Map<string, number>();
  const plants = new Map<string, number>();
  let land = 0;
  for (let c = 0; c < N; c++) {
    if (w.isWater[c]) continue;
    land++;
    const b = w.biomeName(c);
    count.set(b, (count.get(b) ?? 0) + 1);
    let best = '';
    let bp = 0;
    for (const sp of sim.alive) {
      if (!sp.derived.auto || sp.derived.tall > 0.3) continue;
      const p = sim.pop[c * MAXS + sp.slot];
      if (p > bp) {
        bp = p;
        best = sp.desc.replace(/^(Poisonous|Thorny|Arctic|Thick-barked) /i, '');
      }
    }
    if (best) plants.set(best, (plants.get(best) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / land) * 100)}%`).join(', ');
  console.log(`seed ${seed}\n  biomes: ${fmt(count)}\n  ground plants: ${fmt(plants)}`);
}
