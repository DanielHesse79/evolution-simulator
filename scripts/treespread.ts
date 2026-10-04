// How fast do trees radiate into other climates once the first tree appears?
//   npx tsx scripts/treespread.ts [seed ...]
import { Sim } from '../src/sim/simulation';
import { N } from '../src/sim/world';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3, 4);
const isTree = (s: { derived: { auto: boolean; tall: number }; genome: { habitat: string } }) => s.derived.auto && s.derived.tall > 0.3 && s.genome.habitat !== 'aquatic';
for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  let t0 = -1;
  const out: string[] = [];
  for (let i = 0; i < 6000; i++) {
    sim.step();
    if (t0 < 0 && sim.milestones.has('tree')) t0 = sim.tick;
    if (t0 > 0 && [200, 500, 1000].includes(sim.tick - t0)) {
      const trees = sim.alive.filter(isTree);
      const temps = trees.map((t) => t.genome.tempOpt);
      // forested share of the land in each climate band
      const band = [0, 0, 0];
      const forested = [0, 0, 0];
      for (let c = 0; c < N; c++) {
        if (sim.world.isWater[c] || sim.world.moist[c] < 0.45) continue;
        const t = sim.world.temp[c];
        const b = t < 5 ? 0 : t < 18 ? 1 : 2;
        band[b]++;
        if (sim.world.canopy[c] > 0.3) forested[b]++;
      }
      out.push(`+${sim.tick - t0}: ${trees.length} trees, opt ${temps.length ? Math.round(Math.min(...temps)) : '-'}..${temps.length ? Math.round(Math.max(...temps)) : '-'} °C, forest on wet land cold/mild/warm ${forested.map((f, k) => Math.round((f / Math.max(1, band[k])) * 100)).join('/')}%`);
      if (sim.tick - t0 === 1000) break;
    }
  }
  console.log(`seed ${seed} (first tree at ${t0}): ${out.join(' | ')}`);
}
