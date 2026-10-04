// Why do established species die out over a run: housekeeping culls or nature?
//   npx tsx scripts/culls.ts [seed ...]
import { Sim, TOTAL_TICKS } from '../src/sim/simulation';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2);
for (const seed of seeds) {
  const sim = new Sim(seed, 'sandbox');
  const t0 = performance.now();
  let atCap = 0;
  for (let i = 0; i < TOTAL_TICKS; i++) {
    sim.step();
    if (sim.nAlive >= 248) atCap++;
  }
  const ms = (performance.now() - t0) / TOTAL_TICKS;
  const dead = sim.species.filter((s) => !s.alive && s.established);
  const by = { 'cap cull': 0, 'niche cull': 0, 'too few left': 0, nature: 0 };
  const youngCulled: number[] = [];
  for (const s of dead) {
    const c = s.deathCause;
    if (c.startsWith('the world filled up')) by['cap cull']++;
    else if (c.startsWith('it was crowded out of its niche')) by['niche cull']++;
    else if (c.startsWith('its numbers dwindled')) by['too few left']++;
    else by.nature++;
    if (c.startsWith('the world filled up') || c.startsWith('it was crowded out of its niche')) youngCulled.push(s.diedTick - s.bornTick);
  }
  youngCulled.sort((a, b) => a - b);
  console.log(`seed ${seed}: ${dead.length} established species died; ${Object.entries(by).map(([k, v]) => `${k} ${v} (${Math.round((v / dead.length) * 100)}%)`).join(', ')}`);
  console.log(`   culled species' median age ${youngCulled[youngCulled.length >> 1] ?? '-'} steps; at the species cap ${Math.round((atCap / TOTAL_TICKS) * 100)}% of the time; ${ms.toFixed(1)} ms/step; alive at end ${sim.nAlive}`);
}
