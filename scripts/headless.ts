// Runs the simulation without a UI and prints how the world develops. Used for balancing.
//   npm run sim -- [seed] [ticks]
import { Sim, TOTAL_TICKS } from '../src/sim/simulation';

const seed = Number(process.argv[2] ?? 12345);
const ticks = Number(process.argv[3] ?? TOTAL_TICKS);
const quiet = process.argv.includes('--quiet');

const sim = new Sim(seed, 'sandbox');
const w = sim.world;
console.log(`seed ${seed}: land ${(w.landFrac * 100).toFixed(0)}%, continents ${w.continents.filter((c) => c.name).map((c) => `${c.name}(${c.size})`).join(', ')}`);

let logged = 0;
const t0 = performance.now();
let tLast = t0;
for (let i = 1; i <= ticks; i++) {
  sim.step();
  if (!quiet) {
    for (; logged < sim.events.length; logged++) {
      const e = sim.events[logged];
      if (e.major) console.log(`   [${Math.round(e.year).toLocaleString('en-US')}] ${e.icon} ${e.text}`);
    }
  }
  if (i % 250 === 0) {
    const now = performance.now();
    const a = w.atm;
    const by = { microbe: 0, plant: 0, animal: 0 };
    const tiers = [0, 0, 0, 0, 0];
    let land = 0;
    let maxIntel = 0;
    let carn = 0;
    for (const sp of sim.alive) {
      by[sp.kind]++;
      tiers[sp.genome.tier]++;
      if (sp.genome.habitat !== 'aquatic') land++;
      if (sp.genome.diet === 'carn') carn++;
      maxIntel = Math.max(maxIntel, sp.genome.intel);
    }
    console.log(
      `t${String(i).padStart(5)} y${String(Math.round(sim.year)).padStart(7)} | sp ${String(sim.nAlive).padStart(2)} (ever ${sim.species.length}) m/p/a ${by.microbe}/${by.plant}/${by.animal} tiers ${tiers.join(',')} land ${land} carn ${carn} int ${maxIntel.toFixed(2)}` +
        ` | O2 ${a.o2.toFixed(1)} CO2 ${a.co2.toFixed(0)} CH4 ${a.ch4.toFixed(0)} T ${w.meanTemp.toFixed(1)} ice ${(w.iceFrac * 100).toFixed(0)}%` +
        ` | bio oc ${(sim.oceanPhoto / 1e6).toFixed(2)}M ld ${(sim.landPhoto / 1e6).toFixed(2)}M het ${(sim.heteroBio / 1e3).toFixed(0)}k | ${((now - tLast) / 250).toFixed(1)} ms/tick`,
    );
    tLast = now;
  }
}
console.log(`\n${ticks} ticks in ${((performance.now() - t0) / 1000).toFixed(1)} s. Status: ${sim.status}. ${sim.age}`);
console.log('\nLiving species:');
for (const sp of sim.alive.slice().sort((a, b) => b.totalPop - a.totalPop)) {
  const g = sp.genome;
  const traits = (['horns', 'armor', 'speed', 'grasp', 'fur', 'flight', 'social', 'intel', 'toxin'] as const)
    .filter((k) => g[k] > 0.25)
    .map((k) => `${k} ${g[k].toFixed(2)}`)
    .join(', ');
  console.log(
    `  ${sp.icon} ${sp.name.padEnd(30)} ${sp.desc.padEnd(34)} T${g.tier} ${g.diet.padEnd(5)} ${g.habitat.padEnd(11)} size ${g.size.toFixed(1)} t ${g.tempOpt.toFixed(0)}±${g.tempTol.toFixed(0)} m ${g.moistOpt.toFixed(2)} pop ${sp.totalPop.toFixed(0).padStart(8)} cells ${String(sp.cells).padStart(5)} ${traits}`,
  );
}
