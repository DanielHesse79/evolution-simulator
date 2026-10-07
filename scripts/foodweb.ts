// How the food web behaves: do insects thrive under trees, do birds follow the insects, and why do
// land animals die out?   npx tsx scripts/foodweb.ts [seed ...]
import { MAXS, Sim, TOTAL_TICKS } from '../src/sim/simulation';
import { N } from '../src/sim/world';
import type { Species } from '../src/sim/species';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);
const isInsect = (s: Species) => s.kind === 'animal' && s.genome.tier === 3 && s.genome.habitat === 'terrestrial';
const isBird = (s: Species) => s.kind === 'animal' && s.genome.tier >= 4 && s.genome.flight > 0.4 && s.genome.habitat !== 'aquatic';
const bucket = (cause: string) => {
  if (/too hot|too cold/.test(cause)) return 'climate';
  if (/acidic|alkaline/.test(cause)) return 'pH';
  if (/dried out|too wet/.test(cause)) return 'moisture';
  if (/oxygen/.test(cause)) return 'oxygen';
  if (/hunted/.test(cause)) return 'hunted';
  if (/grazed/.test(cause)) return 'grazed';
  if (/outcompeted/.test(cause)) return 'rivals';
  if (/starved|food|scarce|eat/.test(cause)) return 'food';
  if (/give way|room|made way/.test(cause)) return 'culled';
  if (/plague|flames|impact|ash/.test(cause)) return 'disaster';
  return 'other: ' + cause.slice(0, 50);
};

for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  const t0 = performance.now();
  for (let i = 0; i < TOTAL_TICKS; i++) sim.step();
  const ms = (performance.now() - t0) / TOTAL_TICKS;
  const w = sim.world;
  // insects and birds per land cell, forest against open land
  const acc = { forest: { n: 0, ins: 0, bird: 0 }, open: { n: 0, ins: 0, bird: 0 } };
  const insects = sim.alive.filter(isInsect), birds = sim.alive.filter(isBird);
  for (let c = 0; c < N; c++) {
    if (w.isWater[c] || w.cover[c] + w.canopy[c] < 0.1) continue;
    const a = w.canopy[c] > 0.45 ? acc.forest : w.canopy[c] < 0.15 ? acc.open : null;
    if (!a) continue;
    a.n++;
    for (const s of insects) a.ins += sim.pop[c * MAXS + s.slot];
    for (const s of birds) a.bird += sim.pop[c * MAXS + s.slot];
  }
  const per = (a: { n: number; ins: number; bird: number }) => `${a.n} cells, insects ${(a.ins / Math.max(1, a.n)).toFixed(1)}/cell, birds ${(a.bird / Math.max(1, a.n)).toFixed(1)}/cell`;
  console.log(`seed ${seed}: forest ${per(acc.forest)} | open ${per(acc.open)} | ${insects.length} insect, ${birds.length} bird species`);
  // what birds eat
  const diet = new Map<string, number>();
  for (const b of birds) for (const [id, v] of b.ate) { const k = sim.species[id].kind === 'plant' ? 'plants' : isInsect(sim.species[id]) ? 'insects' : 'other animals'; diet.set(k, (diet.get(k) ?? 0) + v); }
  const tot = [...diet.values()].reduce((a, b) => a + b, 0) || 1;
  console.log(`  ${ms.toFixed(1)} ms/step, ${sim.nAlive} species alive, bird diets: ${birds.map((b) => b.genome.diet).join(' ')}`);
  console.log('  birds ate:', [...diet].map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', '));
  // land animal extinctions
  const dead = sim.species.filter((s) => s.kind === 'animal' && s.genome.habitat !== 'aquatic' && s.established && !s.alive);
  const by = new Map<string, number>();
  for (const s of dead) by.set(bucket(s.deathCause), (by.get(bucket(s.deathCause)) ?? 0) + 1);
  const life = dead.map((s) => s.diedTick - s.bornTick).sort((a, b) => a - b);
  const notable = dead.filter((s) => s.diedTick - s.bornTick > 300).length;
  const living = sim.alive.filter((s) => s.kind === 'animal' && s.genome.habitat !== 'aquatic');
  const ages = living.map((s) => sim.tick - s.bornTick).sort((a, b) => a - b);
  console.log(`  ${living.length} land animal species alive, median age ${ages[ages.length >> 1] ?? 0}; ${notable} long-lived (300+ steps) died`);
  console.log(`  land animals: ${dead.length} died, median life ${life[life.length >> 1] ?? 0} steps; causes:`, [...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));

  // pulse: triple the insects in their richest region, then watch the birds and the insects
  const sumOf = (list: Species[]) => list.reduce((a, s) => a + s.totalPop, 0);
  for (let c = 0; c < N; c++) for (const s of insects) sim.pop[c * MAXS + s.slot] *= 3;
  const line: string[] = [];
  for (let i = 0; i <= 60; i++) {
    if (i % 10 === 0) line.push(`t+${i}: insects ${sumOf(insects.filter((s) => s.alive)).toFixed(0)} birds ${sumOf(birds.filter((s) => s.alive)).toFixed(0)}`);
    sim.step();
  }
  console.log('  insect pulse x3 →', line.join(' | '));
}
