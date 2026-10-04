// Pacing survey: at which simulation step does each evolutionary milestone arrive, across several seeds?
//   npx tsx scripts/survey.ts [seed ...]
import { Sim, TOTAL_TICKS } from '../src/sim/simulation';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3, 4, 5, 6);
const keys = ['photo', 'eukaryote', 'multicellular', 'animal', 'landPlant', 'complex', 'tree', 'landAnimal', 'advanced', 'fur', 'flight', 'horns', 'clever', 'sentient'];

console.log(`seed   ${keys.map((k) => k.slice(0, 7).padStart(7)).join(' ')} | alive m/p/a  landA  maxInt  O2   T    ms`);
for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  const at = new Map<string, number>();
  const t0 = performance.now();
  for (let i = 0; i < TOTAL_TICKS; i++) {
    sim.step();
    for (const k of keys) if (!at.has(k) && sim.milestones.has(k)) at.set(k, sim.tick);
  }
  const by = { microbe: 0, plant: 0, animal: 0 };
  let landAnimals = 0;
  let maxInt = 0;
  for (const sp of sim.alive) {
    by[sp.kind]++;
    if (sp.kind === 'animal' && sp.genome.habitat === 'terrestrial') landAnimals++;
    maxInt = Math.max(maxInt, sp.genome.intel);
  }
  console.log(
    `${String(seed).padEnd(6)} ${keys.map((k) => String(at.get(k) ?? '-').padStart(7)).join(' ')} | ${by.microbe}/${by.plant}/${by.animal}`.padEnd(8) +
      `  ${String(landAnimals).padStart(4)}  ${maxInt.toFixed(2)}  ${sim.world.atm.o2.toFixed(1)} ${sim.world.meanTemp.toFixed(1)} ${((performance.now() - t0) / TOTAL_TICKS).toFixed(1)}`,
  );
}
