// A simple robot player for the Awakening goal, to check that the goal is reachable with
// guided evolution alone:  npx tsx scripts/autoplay.ts [seed ...]
import { GUIDE_COST, canGuide, guideEvolution } from '../src/sim/powers';
import { Sim, TOTAL_TICKS } from '../src/sim/simulation';
import type { Species } from '../src/sim/species';

const seeds = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(1, 2, 3);

for (const seed of seeds) {
  const sim = new Sim(seed, 'awakening', (process.env.DIFF as 'gentle' | 'normal' | 'hard') ?? 'normal');
  let guided = 0;
  let born = 0;
  while (sim.status === 'running' && sim.tick < TOTAL_TICKS) {
    sim.step();
    if (!sim.canAfford(GUIDE_COST) || sim.tick % 5 !== 0) continue;
    // the most promising mind: an advanced animal, preferably on land
    let best: Species | null = null;
    let bestScore = -1;
    for (const sp of sim.alive) {
      const g = sp.genome;
      if (sp.kind !== 'animal' || g.tier < 4 || !sp.established) continue;
      const score = g.intel * 3 + g.social + g.grasp + (g.habitat !== 'aquatic' ? 1 : 0) + Math.min(1, sp.cells / 500) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    if (!best) continue;
    const g = best.genome;
    const key = g.social < 0.6 && canGuide(best, 'social', 1) ? 'social' : g.grasp < 0.6 && canGuide(best, 'grasp', 1) ? 'grasp' : 'intel';
    const res = guideEvolution(sim, best, key, 1);
    guided++;
    if (res.ok) born++;
  }
  let maxInt = 0;
  for (const sp of sim.alive) maxInt = Math.max(maxInt, sp.genome.intel);
  console.log(`seed ${seed}: ${sim.status} at step ${sim.tick} (year ${Math.round(sim.year).toLocaleString('en-US')}); guided ${born}/${guided}; brightest mind ${maxInt.toFixed(2)}; ${sim.endText}`);
}
