import { MAX_SIZE, TRAIT_INFO, minSize, traitCap, type TraitKey } from './genome';
import { MAXS, MINP, type Sim } from './simulation';
import type { Species } from './species';

export type PowerId = 'inspect' | 'fire' | 'rain' | 'drought' | 'minerals' | 'acid' | 'alkali' | 'mutagen' | 'plague' | 'transplant' | 'volcano' | 'meteor';

export interface PowerInfo {
  id: PowerId;
  name: string;
  icon: string;
  cost: number;
  /** Radius of the effect in map cells, for the cursor. */
  radius: number;
  hint: string;
  needsSpecies?: boolean;
}

export const POWERS: PowerInfo[] = [
  { id: 'inspect', name: 'Observe', icon: '👁️', cost: 0, radius: 0, hint: 'Look closely at a place and the creatures living there.' },
  { id: 'fire', name: 'Wildfire', icon: '🔥', cost: 8, radius: 1, hint: 'Set the vegetation ablaze. Fire races through dry grass and forest, and needs oxygen to burn.' },
  { id: 'rain', name: 'Rain', icon: '🌧️', cost: 6, radius: 4, hint: 'Bless a region with lasting rain. Deserts bloom, grassland turns to forest.' },
  { id: 'drought', name: 'Drought', icon: '🏜️', cost: 6, radius: 4, hint: 'Withhold the rain. Forests thin out into savanna and desert.' },
  { id: 'minerals', name: 'Enrich', icon: '💎', cost: 6, radius: 4, hint: 'Lace soil or sea with minerals. Everything that grows, grows better.' },
  { id: 'acid', name: 'Acidify', icon: '🧪', cost: 6, radius: 4, hint: 'Sour the soil or water. Only the acid-tolerant will thrive.' },
  { id: 'alkali', name: 'Alkalize', icon: '🧂', cost: 6, radius: 4, hint: 'Make soil or water more alkaline.' },
  { id: 'mutagen', name: 'Mutagen', icon: '☢️', cost: 18, radius: 5, hint: 'Scramble the genes of everything nearby. New forms arise much faster for a while.' },
  { id: 'plague', name: 'Plague', icon: '🦠', cost: 25, radius: 2, hint: 'Unleash a virus on the selected species (or on whatever is most common here). It spreads from host to host.' },
  { id: 'transplant', name: 'Ark', icon: '🕊️', cost: 20, radius: 1, hint: 'Carry a founding population of the selected species to a new shore.', needsSpecies: true },
  { id: 'volcano', name: 'Volcano', icon: '🌋', cost: 30, radius: 4, hint: 'Split the earth. Kills nearby life, darkens the sky, but leaves rich soil.' },
  { id: 'meteor', name: 'Meteor', icon: '☄️', cost: 55, radius: 7, hint: 'Hurl a mountain from the sky. Devastation, fire and a long winter.' },
];

export const GUIDE_COST = 30;

export interface PowerResult {
  ok: boolean;
  msg: string;
}

const fail = (msg: string): PowerResult => ({ ok: false, msg });

/** Use a divine power on a map cell. Energy is only spent when the act succeeds. */
export function usePower(sim: Sim, id: PowerId, cell: number, selected: Species | null): PowerResult {
  const info = POWERS.find((p) => p.id === id)!;
  const w = sim.world;
  if (id === 'inspect') return { ok: true, msg: '' };
  if (!sim.canAfford(info.cost)) return fail(`Not enough divine energy (${info.cost} needed).`);
  const where = w.isWater[cell] ? 'the sea' : w.continentName(cell);

  switch (id) {
    case 'fire': {
      if (sim.fireOxygen() <= 0) return fail('The air holds too little oxygen for anything to burn.');
      let lit = 0;
      sim.forRadius(cell, 1.5, (c) => {
        if (sim.ignite(c)) lit++;
      });
      if (!lit) return fail('There is nothing here that will burn.');
      sim.log('🔥', `You set ${where} ablaze.`, { cell });
      break;
    }
    case 'rain':
    case 'drought': {
      const sign = id === 'rain' ? 1 : -1;
      let land = 0;
      sim.forRadius(cell, 4, (c, dist) => {
        if (w.isWater[c]) return;
        land++;
        w.moistMod[c] = Math.max(-0.6, Math.min(0.6, w.moistMod[c] + sign * 0.3 * (1 - dist / 5)));
      });
      if (!land) return fail('Rain and drought only matter on land.');
      sim.climateDirty = true;
      sim.log(id === 'rain' ? '🌧️' : '🏜️', id === 'rain' ? `You send lasting rains to ${where}.` : `You withhold the rain from ${where}.`, { cell });
      break;
    }
    case 'minerals':
      sim.forRadius(cell, 4, (c, dist) => {
        w.mineralMod[c] = Math.min(1, w.mineralMod[c] + 0.4 * (1 - dist / 5));
      });
      sim.climateDirty = true;
      sim.log('💎', `You enrich ${where} with minerals.`, { cell });
      break;
    case 'acid':
    case 'alkali': {
      const sign = id === 'alkali' ? 1 : -1;
      sim.forRadius(cell, 4, (c, dist) => {
        w.phMod[c] = Math.max(-3, Math.min(3, w.phMod[c] + sign * 1.0 * (1 - dist / 5)));
      });
      sim.climateDirty = true;
      sim.log(id === 'acid' ? '🧪' : '🧂', id === 'acid' ? `You sour the ${w.isWater[cell] ? 'waters' : `soil of ${where}`}.` : `You sweeten the ${w.isWater[cell] ? 'waters' : `soil of ${where}`}.`, { cell });
      break;
    }
    case 'mutagen': {
      const touched = new Set<Species>();
      sim.forRadius(cell, 5, (c) => {
        for (const sp of sim.alive) if (sim.pop[c * MAXS + sp.slot] > MINP) touched.add(sp);
      });
      if (!touched.size) return fail('Nothing lives here to be changed.');
      for (const sp of touched) sp.mutagen = 60;
      let born = 0;
      for (const { sp } of sim.speciesAt(cell).slice(0, 4)) {
        if (sim.trySpeciate(sp, { crowd: 1 })) born++;
      }
      sim.addEffect('spark', cell, 5);
      sim.log('☢️', `You stir the genes of ${touched.size} species in ${where}.${born ? ' Strange new forms appear at once.' : ''}`, { cell });
      break;
    }
    case 'plague': {
      let target: Species | null = null;
      let at = cell;
      if (selected?.alive) {
        let bestDist = Infinity;
        sim.forRadius(cell, 4, (c, dist) => {
          if (dist < bestDist && sim.pop[c * MAXS + selected.slot] > MINP) {
            bestDist = dist;
            at = c;
          }
        });
        if (bestDist < Infinity) target = selected;
      }
      if (!target) {
        const here = sim.speciesAt(cell);
        if (!here.length) return fail('There are no hosts here.');
        if (selected?.alive) return fail(`${selected.name} does not live here.`);
        target = here[0].sp;
      }
      if (sim.plagues.some((p) => p.speciesId === target!.id)) return fail(`${target.name} is already stricken.`);
      if (!sim.startPlague(target, at, false)) return fail('The sickness finds no host.');
      break;
    }
    case 'transplant': {
      if (!selected?.alive) return fail('Select a living species first (click one in the list).');
      const fit = sim.staticFitness(selected.genome, cell);
      const founders = Math.max(40, selected.totalPop * 0.02);
      const settled = sim.plant(selected, cell, founders);
      if (!settled) {
        return fail(selected.genome.habitat === 'aquatic' ? `${selected.name} cannot live out of water.` : selected.genome.habitat === 'terrestrial' ? `${selected.name} would drown there.` : `${selected.name} cannot live there.`);
      }
      sim.addEffect('arrive', cell, 2);
      const outlook = fit < 0.1 ? ' The place is hostile to them; they will not last.' : fit < 0.3 ? ' They will struggle here.' : '';
      sim.log('🕊️', `You carry ${selected.name} to ${where}.${outlook}`, { speciesId: selected.id, cell });
      sim.spend(info.cost);
      return { ok: true, msg: outlook.trim() };
    }
    case 'volcano':
      sim.volcano(cell, false);
      break;
    case 'meteor':
      sim.meteor(cell, false);
      break;
  }
  sim.spend(info.cost);
  return { ok: true, msg: '' };
}

export type GuideKey = TraitKey | 'size';

/** Can this species be pushed further in this direction at all? */
export function canGuide(sp: Species, key: GuideKey, dir: 1 | -1): boolean {
  const g = sp.genome;
  if (key === 'size') return dir > 0 ? g.size < MAX_SIZE[g.tier] - 0.05 : g.size > minSize(g) + 0.05;
  return dir > 0 ? g[key] < traitCap(g, key) - 0.02 : g[key] > 0.02;
}

/**
 * Guided evolution: God nudges one trait, and a daughter species with the change is born
 * where the parent is most numerous. Whether she survives is up to natural selection.
 */
export function guideEvolution(sim: Sim, sp: Species, key: GuideKey, dir: 1 | -1): PowerResult {
  if (!sp.alive) return fail('That species is extinct.');
  if (key === 'intel' && dir > 0 && sp.genome.tier === 4 && sp.genome.intel < 0.98 && !canGuide(sp, key, dir)) {
    return fail('A mind cannot grow alone. Give this creature grasping limbs and a social life first.');
  }
  if (!canGuide(sp, key, dir)) return fail(key === 'size' ? 'This body plan cannot change size any further.' : `This body plan cannot ${dir > 0 ? 'develop' : 'reduce'} ${TRAIT_INFO[key].label.toLowerCase()} any further.`);
  if (!sim.canAfford(GUIDE_COST)) return fail(`Not enough divine energy (${GUIDE_COST} needed).`);
  const cell = sim.densestCell(sp);
  if (cell < 0) return fail('The species is too scattered.');
  const child = sim.trySpeciate(sp, {
    atCell: cell,
    force: (g) => {
      if (key === 'size') g.size += dir * 0.8;
      else g[key] += dir * 0.25;
    },
  });
  if (!child) return fail('The world has no room for another species right now.');
  sim.spend(GUIDE_COST);
  sim.addEffect('spark', cell, 2);
  const what = key === 'size' ? (dir > 0 ? 'greater size' : 'smaller size') : `${dir > 0 ? 'more' : 'less'} ${TRAIT_INFO[key].label.toLowerCase()}`;
  sim.log('🧬', `You reach into ${sp.name} and draw out a new form with ${what}: ${child.name}.`, { speciesId: child.id, cell });
  return { ok: true, msg: `${child.name} is born.` };
}
