// Which trees exist at the end of a run, and what climate they are built for.
//   npx tsx scripts/trees.ts [seed ...]
import { Sim, TOTAL_TICKS } from '../src/sim/simulation';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const trees = sim.alive.filter((s) => s.derived.auto && s.derived.tall > 0.3 && s.genome.habitat !== 'aquatic');
  const born = sim.species.filter((s) => s.derived.auto && s.derived.tall > 0.3 && s.genome.habitat !== 'aquatic').length;
  console.log(`seed ${seed}: ${trees.length} land tree species alive (${born} ever)`);
  for (const t of trees.sort((a, b) => a.genome.tempOpt - b.genome.tempOpt)) console.log(`   ${t.desc.padEnd(34)} ${Math.round(t.genome.tempOpt)}±${Math.round(t.genome.tempTol)} °C  rain ${t.genome.moistOpt.toFixed(2)}  cells ${t.cells}`);
}
