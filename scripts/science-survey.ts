import assert from 'node:assert/strict';
import { Sim, TOTAL_TICKS, MAXS } from '../src/sim/simulation';

for (const seed of [12345, 42, 2026]) {
  const sim = new Sim(seed, 'sandbox');
  const start = performance.now();
  let lateMarineBranches = 0;
  let settledSeaAnimals = 0;
  for (let t = 0; t < TOTAL_TICKS; t++) {
    const previous = sim.species.length;
    sim.step();
    const born = sim.species.slice(previous);
    if (sim.tick > 3000) lateMarineBranches += born.filter(s => s.genome.habitat === 'aquatic').length;
    // once the seas have settled, no new sea animals or microbes arise on their own
    if (sim.seaSettled) settledSeaAnimals += born.filter(s => !s.playerMade && (s.kind === 'microbe' || (s.kind === 'animal' && s.genome.habitat === 'aquatic'))).length;
    if (sim.tick % 500 === 0) {
      assert.ok(sim.nAlive > 0 && sim.nAlive < MAXS);
      for (const value of Object.values(sim.world.atm)) assert.ok(Number.isFinite(value));
      assert.ok(sim.pop.every(p => Number.isFinite(p) && p >= 0));
      console.log(JSON.stringify({ seed, tick: sim.tick, species: sim.nAlive, age: sim.age, o2: +sim.world.atm.o2.toFixed(1), co2: Math.round(sim.world.atm.co2), land: +sim.world.landFrac.toFixed(2) }));
    }
  }
  assert.ok(lateMarineBranches > 0, 'marine plants should keep evolving into later epochs');
  assert.equal(settledSeaAnimals, 0, 'settled seas bring forth no new animals or microbes');
  assert.ok(sim.milestones.has('tree'), 'forests should arise');
  console.log(JSON.stringify({ seed, seconds: +((performance.now() - start) / 1000).toFixed(1), lateMarineBranches, seaSettled: sim.seaSettled, milestones: [...sim.milestones] }));
}
