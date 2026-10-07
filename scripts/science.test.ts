import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CarbonCycle, DRIFT, meanCycle, Tectonics } from '../src/sim/earth';
import { mutate, type MutEnv } from '../src/sim/genome';
import { RNG } from '../src/sim/rng';
import { Sim, MAXS, TOTAL_TICKS, yearAt } from '../src/sim/simulation';
import { World, N, W, H } from '../src/sim/world';

const near = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('deep-time clock is continuous through the game end; unresolved orbital cycles average out', () => {
  near(yearAt(TOTAL_TICKS), 4e9);
  near(yearAt(6001) - yearAt(6000), yearAt(1), 1e-6);
  near(meanCycle(0, 41000 * 20, 41000), 0);
  near(meanCycle(0, 41000 / 2, 41000), 2 / Math.PI);
});

// Mutation proposals deliberately lean towards the place where the daughter is born: each one stands
// for many generations of selection that the game does not simulate. The invasion test still decides.
test('mutation proposals lean towards the local climate, but stay variable', () => {
  const parent = { ...new Sim(12345, 'sandbox').alive[0].genome, tempOpt: 20 };
  const base: MutEnv = { t: 20, ph: 7, m: 0.5, cls: 0, o2: 0, parentHab: 1, hasAutoFood: false, hasPrey: false, hasHerb: false, hasCarn: false, tierOpen: false };
  const mean = (t: number) => {
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = mutate(parent, new RNG(seed), { ...base, t });
      if (r) {
        sum += r.g.tempOpt;
        n++;
      }
    }
    return sum / n;
  };
  assert.ok(mean(-10) < 15, 'cold birthplaces pull proposals colder');
  assert.ok(mean(40) > 25, 'warm birthplaces pull proposals warmer');
  const spread = new Set<number>();
  for (let seed = 1; seed <= 50; seed++) spread.add(Math.round(mutate(parent, new RNG(seed), { ...base, t: 30 })!.g.tempOpt));
  assert.ok(spread.size > 5, 'proposals are not all identical');
});

test('plates preserve stationary terrain, move reproducibly at a fixed share of centimetres per year, and make boundaries', () => {
  const w = new World(12345), original = w.elev.slice();
  const a = new Tectonics(W, H, original, 12345), b = new Tectonics(W, H, original, 12345);
  const ea = original.slice(), eb = original.slice();
  a.advance(0, ea);
  for (let c = 0; c < N; c++) near(ea[c], original[c]);
  const shifts = a.advance(1e6, ea);
  b.advance(1e6, eb);
  assert.deepEqual(ea, eb);
  assert.ok(ea.some((v, c) => Math.abs(v - original[c]) > 0.01));
  for (let i = 0; i < shifts.length; i++) {
    const km = Math.hypot(shifts[i].dx * 40075 / W, shifts[i].dy * 20004 / H);
    near(km, a.plates[i].speed * 10 * DRIFT, 1e-6);
  }
  assert.ok(a.activity.some(v => v > 0.7));
  assert.ok(a.activity.some(v => v < 0.1));
});

test('carbon flows conserve carbon stocks and oxygenation is delayed by reducing material', () => {
  const cycle = new CarbonCycle(), atm = { co2: 1200, o2: 0.2, ch4: 30 };
  const initial = atm.co2 + cycle.ocean + cycle.organic + cycle.rock;
  cycle.step(atm, 1e6, 1, 0, 0);
  assert.ok(cycle.organic > 0);
  assert.ok(atm.o2 <= 0.2);
  for (let i = 0; i < 6000; i++) cycle.step(atm, 4e9 / 6000, 0.6, 0.2, 4);
  near(atm.co2 + cycle.ocean + cycle.organic + cycle.rock, initial, 1e-7);
  for (const v of [atm.co2, atm.o2, cycle.ocean, cycle.organic, cycle.rock]) assert.ok(Number.isFinite(v) && v >= 0);
  assert.ok(atm.o2 > 1);
});

test('radiation varies geographically; oxygen shields UV separately from ionizing radiation', () => {
  const w = new World(42);
  const before = w.radiation.slice(), uv = w.uv.slice();
  w.atm.o2 = 21;
  w.updateClimate();
  assert.ok(Math.max(...before) - Math.min(...before) > 0.5);
  assert.deepEqual(before, w.radiation);
  assert.ok(w.uv.every((v, c) => v < uv[c]));
});

test('ice lowers effective sea level without overwriting the player setting; rendered relief matches moved terrain', () => {
  const w = new World(17);
  w.atm.seaLevel = 0.05;
  w.temp.fill(-25);
  w.advanceGeology(0, 1e6);
  near(w.atm.seaLevel, 0.05);
  assert.ok(w.iceSeaLevel < 0 && w.seaLevel < 0.05);
  for (let c = 0; c < N; c += 71) near(w.elevAt((c % W + 0.5) / W, (Math.floor(c / W) + 0.5) / H), w.elev[c]);
});

test('moving crust conserves population biomass and rebuilds valid named regions', () => {
  const sim = new Sim(12345, 'sandbox');
  const sp = sim.alive[0];
  sp.genome.habitat = 'terrestrial'; // isolated remapping test, no ecology step
  sim.pop.fill(0);
  const land = sim.world.isWater.findIndex(v => !v);
  sim.pop[land * MAXS + sp.slot] = 100;
  sim.year = yearAt(8);
  (sim as unknown as { moveContinents(): void }).moveContinents();
  near(sim.pop.reduce((a, b) => a + b, 0), 100, 1e-4);
  assert.ok(sim.world.terrainVersion > 0);
  assert.ok(sim.regionOf.every(id => id >= 0 && id < sim.regions.length));
  for (const r of sim.regions) for (const c of r.cells) assert.equal(sim.regionOf[c], r.id);
});

test('infection selects local standing resistance without changing the species genome or distant populations', () => {
  const sim = new Sim(42, 'sandbox'), sp = sim.alive[0];
  sim.pop.fill(0);
  const infected = 20 * W + 20, distant = 60 * W + 120;
  sim.pop[infected * MAXS + sp.slot] = 100;
  sim.pop[distant * MAXS + sp.slot] = 100;
  sp.genome.immunity = 0.4;
  sp.totalPop = 200;
  const before = { ...sp.genome };
  const pl = sim.startPlague(sp, infected, false, 'genotoxic')!;
  pl.spread = 0;
  for (let i = 0; i < 12; i++) (sim as unknown as { updatePlagues(): void }).updatePlagues();
  assert.deepEqual(sp.genome, before);
  assert.ok(sim.localGenome(sp, infected).immunity > before.immunity);
  near(sim.localGenome(sp, distant).immunity, before.immunity);
  near(sim.pop[distant * MAXS + sp.slot], 100);
  assert.equal(sim.plagues.length, 0);
  assert.equal(pl.state[infected], 255);
});

test('all viral mechanisms have distinct parameters and no guaranteed inherited mutation', () => {
  const outcomes = [];
  for (const kind of ['acute', 'genotoxic', 'retroviral'] as const) {
    const sim = new Sim(9, 'sandbox'), sp = sim.alive[0];
    const c = sim.densestCell(sp);
    const pl = sim.startPlague(sp, c, false, kind)!;
    assert.equal(pl.kind, kind);
    outcomes.push(pl.mortality);
    assert.equal(sim.species.length, 1);
  }
  assert.equal(new Set(outcomes).size, 3);
});
