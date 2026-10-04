import { RNG } from './rng';
import { CLS_WET } from './world';

export type Diet = 'chemo' | 'photo' | 'herb' | 'carn' | 'omni';
export type Habitat = 'aquatic' | 'amphibious' | 'terrestrial';
export type Kind = 'microbe' | 'plant' | 'animal';

export const TRAIT_KEYS = ['horns', 'armor', 'speed', 'grasp', 'fur', 'flight', 'social', 'intel', 'immunity', 'toxin', 'fertility'] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export interface Genome {
  /** Complexity: 0 prokaryote, 1 eukaryote, 2 simple multicellular, 3 complex, 4 advanced. */
  tier: number;
  diet: Diet;
  habitat: Habitat;
  /** Body size on a log scale, 0 (microbe) .. 10 (colossus). */
  size: number;
  tempOpt: number;
  tempTol: number;
  phOpt: number;
  phTol: number;
  moistOpt: number;
  moistTol: number;
  horns: number;
  armor: number;
  speed: number;
  grasp: number;
  fur: number;
  flight: number;
  social: number;
  intel: number;
  immunity: number;
  toxin: number;
  fertility: number;
}

export const TIER_NAMES = ['Prokaryote', 'Eukaryote', 'Simple multicellular', 'Complex organism', 'Advanced organism'];
/** Oxygen (%) a body plan of each tier needs before it can evolve or thrive. */
export const TIER_O2 = [0, 1, 2.5, 5, 10];
/** Oxygen (%) needed for an ozone shield, without which the land is scorched by UV. */
export const LAND_O2 = 3;
export const MAX_SIZE = [0.6, 1.6, 4, 7, 10];
export const MIN_SIZE = [0, 0.7, 1.6, 2.4, 3.2];
/** Intelligence at which a species becomes aware of its own existence. */
export const SENTIENCE = 0.9;

export const DIET_NAMES: Record<Diet, string> = {
  chemo: 'Chemosynthesis',
  photo: 'Photosynthesis',
  herb: 'Herbivore',
  carn: 'Carnivore',
  omni: 'Omnivore',
};

export const HABITAT_NAMES: Record<Habitat, string> = {
  aquatic: 'Aquatic',
  amphibious: 'Amphibious',
  terrestrial: 'Terrestrial',
};

export const TRAIT_INFO: Record<TraitKey, { label: string; icon: string; hint: string }> = {
  horns: { label: 'Horns', icon: '🦌', hint: 'Fend off predators in open country, but tangle hopelessly in dense forest.' },
  armor: { label: 'Armor', icon: '🛡️', hint: 'Shell, scales or bark. Protects, but slows the bearer down.' },
  speed: { label: 'Speed', icon: '💨', hint: 'Outrun hunters or run down prey on open ground. Little use among trees.' },
  grasp: { label: 'Grasping limbs', icon: '🖐️', hint: 'Climb the canopy and handle objects. A road towards cleverness.' },
  fur: { label: 'Insulation', icon: '🧥', hint: 'Fur, feathers or blubber. Shrugs off the cold, suffers in the heat.' },
  flight: { label: 'Flight', icon: '🪽', hint: 'Escape, hunt and cross seas. Only possible for the small.' },
  social: { label: 'Sociality', icon: '👥', hint: 'Herds and packs give safety and teamwork, but plagues spread faster.' },
  intel: { label: 'Intelligence', icon: '🧠', hint: 'A costly brain. It only pays off together with hands and company.' },
  immunity: { label: 'Immunity', icon: '💉', hint: 'Resistance to plagues.' },
  toxin: { label: 'Toxins', icon: '☠️', hint: 'Venom, poison or thorns that deter whoever tries to eat it.' },
  fertility: { label: 'Fertility', icon: '🥚', hint: 'Breeds and spreads fast, but competes poorly when the land is crowded.' },
};

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function isAuto(g: Genome): boolean {
  return g.diet === 'photo' || g.diet === 'chemo';
}

export function kindOf(g: Genome): Kind {
  return g.tier <= 1 ? 'microbe' : isAuto(g) ? 'plant' : 'animal';
}

export function minSize(g: Genome): number {
  if (isAuto(g) && g.tier >= 2) return 1.4;
  return MIN_SIZE[g.tier];
}

/** How far a trait can develop, given the body plan. */
export function traitCap(g: Genome, k: TraitKey): number {
  const t = g.tier;
  if (k === 'fertility' || k === 'immunity') return 1;
  if (isAuto(g)) {
    if (k === 'toxin') return t >= 2 ? 1 : 0.4;
    if (k === 'armor') return t >= 3 ? 1 : t === 2 ? 0.3 : 0;
    return 0;
  }
  if (k === 'flight') {
    if (t < 3 || g.habitat === 'aquatic') return 0;
    return clamp((7.5 - g.size) / 2, 0, 1);
  }
  if (t < 2) return k === 'toxin' || k === 'speed' ? 0.3 : 0;
  if (t === 2) {
    if (k === 'armor') return 0.5;
    if (k === 'toxin') return 0.6;
    if (k === 'speed') return 0.35;
    if (k === 'social') return 0.2;
    return 0;
  }
  if (k === 'grasp' && g.habitat === 'aquatic') return t === 3 ? 0.5 : 0.3;
  // a great mind needs hands to act and others to learn from
  if (k === 'intel' && t === 4) return 0.3 + 0.7 * clamp(Math.min(g.grasp, g.social) / 0.55, 0, 1);
  if (k === 'horns') {
    if (g.habitat === 'aquatic' || g.flight > 0.4) return 0;
    if (g.diet === 'carn') return 0.3;
  }
  if (t === 3) {
    if (k === 'intel' || k === 'fur') return 0.25;
    if (k === 'grasp' || k === 'horns') return 0.5;
    if (k === 'social') return 0.8;
    return 1;
  }
  return 1;
}

export function sanitize(g: Genome): void {
  g.tier = clamp(Math.round(g.tier), 0, 4);
  g.size = clamp(g.size, minSize(g), MAX_SIZE[g.tier]);
  g.tempOpt = clamp(g.tempOpt, -25, 70);
  g.tempTol = clamp(g.tempTol, 3, 16);
  g.phOpt = clamp(g.phOpt, 2, 11);
  g.phTol = clamp(g.phTol, 0.4, 2.5);
  g.moistOpt = clamp(g.moistOpt, 0.02, 1);
  g.moistTol = clamp(g.moistTol, 0.08, 0.45);
  for (const k of TRAIT_KEYS) g[k] = clamp(g[k], 0, traitCap(g, k));
}

// ---------------------------------------------------------------------------
// Environmental responses
// ---------------------------------------------------------------------------

export function tempResponse(g: Genome, t: number): number {
  const d = t - g.tempOpt;
  // fur keeps out the cold; a truly clever animal makes its own shelter, clothing and fire
  const wit = Math.max(0, g.intel - 0.5) * 2;
  const s = d < 0 ? g.tempTol + g.fur * 10 + wit * 6 : g.tempTol * (1 - 0.3 * g.fur) + wit * 4;
  let v = Math.exp(-0.5 * (d / s) * (d / s));
  if (g.tier >= 1 && t > 46) v *= Math.max(0, 1 - (t - 46) / 8);
  return v;
}

export function phResponse(g: Genome, ph: number): number {
  const d = (ph - g.phOpt) / g.phTol;
  return Math.exp(-0.5 * d * d);
}

/** Response to rainfall; only meaningful on land. Big plants need a lot of water. */
export function moistResponse(g: Genome, m: number): number {
  const auto = isAuto(g);
  const tol = auto ? g.moistTol : g.moistTol + 0.18;
  const d = (m - g.moistOpt) / tol;
  let v = Math.exp(-0.5 * d * d);
  if (auto) {
    const need = 0.1 + 0.065 * g.size;
    v *= 1 / (1 + Math.exp(-(m - need) / 0.05));
  }
  return v;
}

/** How well a habitat type suits each cell class [deep, shallow, wet land, dry land]. */
export function habFactors(g: Genome): [number, number, number, number] {
  const auto = isAuto(g);
  if (g.habitat === 'aquatic') {
    if (g.diet === 'photo') return g.size > 2.5 ? [0.05, 1, 0, 0] : [0.75, 1, 0, 0];
    if (g.diet === 'chemo') return [1, 0.8, 0, 0];
    return [0.8, 1, 0, 0];
  }
  if (g.habitat === 'amphibious') return auto ? [0, 0.7, 1, 0.25] : [0.1, 0.85, 1, 0.2];
  return [0, 0, 1, 1];
}

/** Effect of the air on a species: oxygen for big active bodies, ozone for land life. */
export function o2Factor(g: Genome, o2: number, co2: number): number {
  const hetero = !isAuto(g);
  // plants make their own oxygen; only animals and other eaters need ever more of it as they grow
  const need = hetero ? TIER_O2[g.tier] + 0.5 * g.size : TIER_O2[Math.min(g.tier, 2)];
  let f = 1;
  if (need > 0 && o2 < need) f = (o2 / need) * (o2 / need);
  if (g.habitat !== 'aquatic' && o2 < LAND_O2) f *= Math.pow(o2 / LAND_O2, 1.5);
  if (g.tier === 0 && g.diet === 'chemo') f *= Math.max(0.4, 1 - o2 * 0.035);
  if (hetero && co2 > 4000) f *= Math.max(0.2, 1 - (co2 - 4000) / 6000);
  return f;
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

export interface MutEnv {
  t: number;
  ph: number;
  m: number;
  cls: number;
  o2: number;
  /** The parent's habitat factor at the target cell; 0 means it cannot live there at all. */
  parentHab: number;
  hasAutoFood: boolean;
  hasPrey: boolean;
  hasHerb: boolean;
  hasCarn: boolean;
  /** No living relative has reached the next level of complexity yet: an open frontier. */
  tierOpen: boolean;
}

function proposeDiet(g: Genome, env: MutEnv, rng: RNG): Diet | null {
  const opts: [Diet, number][] = [];
  switch (g.diet) {
    case 'chemo':
      if (g.tier <= 1) {
        opts.push(['photo', 3]);
        if (env.hasAutoFood) opts.push(['herb', env.hasHerb ? 0.4 : 2.5]);
      }
      break;
    case 'photo':
      if (g.tier <= 1) opts.push(['herb', env.hasHerb ? 0.3 : 2]);
      break;
    case 'herb':
      if (env.hasPrey) {
        opts.push(['omni', 1]);
        opts.push(['carn', env.hasCarn ? 0.4 : 2.5]);
      }
      break;
    case 'omni':
      if (env.hasPrey) opts.push(['carn', 1]);
      if (env.hasAutoFood) opts.push(['herb', 1]);
      break;
    case 'carn':
      if (env.hasAutoFood) opts.push(['omni', 1]);
      break;
  }
  let total = 0;
  for (const o of opts) total += o[1];
  if (total <= 0 || !rng.chance(Math.min(1, total / 3))) return null;
  let r = rng.next() * total;
  for (const o of opts) {
    r -= o[1];
    if (r <= 0) return o[0];
  }
  return opts[opts.length - 1][0];
}

/**
 * Produce a mutated daughter genome adapted towards the conditions of a target cell.
 * Returns null when the lineage simply cannot make the leap (e.g. a microbe onto land).
 */
export function mutate(parent: Genome, rng: RNG, env: MutEnv): { g: Genome; major: 'tier' | 'diet' | 'habitat' | null } | null {
  const g: Genome = { ...parent };
  let major: 'tier' | 'diet' | 'habitat' | null = null;
  const land = env.cls >= CLS_WET;
  const landReady = g.diet !== 'chemo' && (isAuto(g) ? g.tier >= 2 : g.tier >= 3);
  // chemosynthesis is a trick of single cells; it never builds a body
  const maxTier = g.diet === 'chemo' ? 1 : 4;

  if (env.parentHab <= 0.01) {
    // the target cell is the wrong medium entirely: only a change of habitat will do
    if (g.habitat === 'aquatic' && land) {
      if (!landReady || env.o2 < LAND_O2 * 0.8) return null;
      g.habitat = 'amphibious';
      g.moistOpt = clamp(env.m, 0.3, 0.95);
      g.moistTol = 0.3;
      major = 'habitat';
    } else if (g.habitat === 'terrestrial' && !land) {
      if (!rng.chance(0.25)) return null;
      g.habitat = 'amphibious';
      major = 'habitat';
    } else return null;
  } else if (env.parentHab < 0.5 && g.habitat === 'amphibious' && rng.chance(0.2)) {
    // marginal ground for a creature of the shore: commit to the dry land or to the open water
    if (land && landReady) {
      g.habitat = 'terrestrial';
      major = 'habitat';
    } else if (!land) {
      g.habitat = 'aquatic';
      major = 'habitat';
    }
  } else {
    const roll = rng.next();
    if (roll < (env.tierOpen ? 0.25 : 0.05)) {
      if (g.tier < maxTier && env.o2 >= TIER_O2[g.tier + 1]) {
        g.tier++;
        g.size = Math.max(g.size, minSize(g)) + rng.range(0, 0.4);
        major = 'tier';
      }
    } else if (roll < 0.29) {
      if (g.habitat === 'amphibious') {
        if (land && landReady && rng.chance(0.7)) {
          g.habitat = 'terrestrial';
          major = 'habitat';
        } else if (!land && rng.chance(0.3)) {
          g.habitat = 'aquatic';
          major = 'habitat';
        }
      } else if (g.habitat === 'terrestrial' && env.cls === CLS_WET && rng.chance(0.15)) {
        g.habitat = 'amphibious';
        major = 'habitat';
      }
    } else if (roll < 0.36) {
      const nd = proposeDiet(g, env, rng);
      if (nd) {
        g.diet = nd;
        major = 'diet';
      }
    }
  }

  // adaptation towards local conditions, or plain drift
  if (rng.chance(0.75)) g.tempOpt += (env.t - g.tempOpt) * rng.range(0.25, 0.8);
  else g.tempOpt += rng.gauss() * 3;
  if (rng.chance(0.6)) g.phOpt += (env.ph - g.phOpt) * rng.range(0.25, 0.8);
  else g.phOpt += rng.gauss() * 0.3;
  if (land && g.habitat !== 'aquatic') {
    if (rng.chance(0.7)) g.moistOpt += (env.m - g.moistOpt) * rng.range(0.25, 0.8);
    else g.moistOpt += rng.gauss() * 0.08;
  }
  if (rng.chance(0.25)) g.tempTol *= rng.range(0.8, 1.25);
  if (rng.chance(0.2)) g.phTol *= rng.range(0.8, 1.25);
  if (rng.chance(0.2)) g.moistTol *= rng.range(0.8, 1.25);
  if (isAuto(g) && g.habitat !== 'aquatic' && g.tier >= 2) {
    // land plants race upwards for light wherever there is water to spare, and shrink where it is dry
    const need = 0.1 + 0.065 * g.size;
    if (env.m > need + 0.18) {
      if (rng.chance(0.6)) g.size += Math.abs(rng.gauss()) * 0.6;
    } else if (env.m < need + 0.04) {
      if (rng.chance(0.6)) g.size -= Math.abs(rng.gauss()) * 0.6;
    } else if (rng.chance(0.3)) g.size += rng.gauss() * 0.4;
  } else if (rng.chance(0.4)) g.size += rng.gauss() * 0.5 + 0.15;

  const open = TRAIT_KEYS.filter((k) => traitCap(g, k) > 0);
  const nTraits = 1 + rng.int(2);
  for (let i = 0; i < nTraits && open.length; i++) {
    const k = rng.pick(open);
    g[k] += rng.gauss() * 0.18 + 0.03;
  }
  sanitize(g);
  return { g, major };
}

// ---------------------------------------------------------------------------
// Description and naming
// ---------------------------------------------------------------------------

/** A plain-language description and an emoji for a body plan. */
export function describe(g: Genome): { desc: string; icon: string } {
  const aquatic = g.habitat === 'aquatic';
  const amph = g.habitat === 'amphibious';
  if (g.tier === 0) {
    if (g.diet === 'chemo') return { desc: g.tempOpt > 42 ? 'Heat-loving vent microbe' : 'Mineral-eating microbe', icon: '🦠' };
    if (g.diet === 'photo') return { desc: 'Blue-green bacterium', icon: '🦠' };
    return { desc: g.diet === 'carn' ? 'Predatory bacterium' : 'Microbe-eating bacterium', icon: '🦠' };
  }
  if (g.tier === 1) {
    if (g.diet === 'photo') return { desc: 'Single-celled alga', icon: '🟢' };
    if (g.diet === 'chemo') return { desc: 'Chemical-feeding protist', icon: '🧫' };
    return { desc: g.diet === 'carn' ? 'Hunting protist' : g.diet === 'omni' ? 'Engulfing amoeba' : 'Grazing protozoan', icon: '🧫' };
  }
  if (isAuto(g)) return describePlant(g);

  if (g.intel >= SENTIENCE) return { desc: 'Self-aware toolmaker', icon: '🧑' };

  let noun: string;
  let icon: string;
  if (g.tier === 2) {
    if (aquatic) {
      if (g.diet === 'herb') [noun, icon] = g.speed < 0.12 ? ['filter-feeding sponge', '🧽'] : ['grazing flatworm', '🪱'];
      else if (g.diet === 'carn') [noun, icon] = ['stinging jelly', '🪼'];
      else [noun, icon] = ['drifting comb jelly', '🪼'];
    } else [noun, icon] = g.diet === 'carn' ? ['hunting worm', '🪱'] : ['soil worm', '🪱'];
  } else if (g.tier === 3) {
    if (aquatic) {
      if (g.armor > 0.45) [noun, icon] = g.speed > 0.4 ? ['sea scorpion', '🦞'] : g.diet === 'herb' ? ['shelled mollusc', '🐚'] : ['armored crawler', '🦀'];
      else if (g.speed > 0.5) [noun, icon] = g.diet === 'herb' ? ['darting shrimp', '🦐'] : ['squid-like hunter', '🦑'];
      else if (g.grasp > 0.3) [noun, icon] = ['tentacled crawler', '🐙'];
      else [noun, icon] = g.diet === 'herb' ? ['sea snail', '🐌'] : ['soft-bodied sea hunter', '🦑'];
    } else if (amph) [noun, icon] = ['shore scuttler', '🦀'];
    else if (g.flight > 0.4) [noun, icon] = g.diet === 'carn' ? ['hawking dragonfly', '🪰'] : ['winged insect', '🦋'];
    else if (g.social > 0.55) [noun, icon] = ['colony insect', '🐜'];
    else if (g.toxin > 0.5) [noun, icon] = g.diet === 'herb' ? ['poisonous millipede', '🐛'] : ['venomous arachnid', '🦂'];
    else if (g.armor > 0.4) [noun, icon] = ['armored beetle', '🪲'];
    else [noun, icon] = g.diet === 'carn' ? ['hunting spider', '🕷️'] : ['many-legged crawler', '🐛'];
  } else {
    [noun, icon] = describeVertebrate(g);
  }

  const adj: string[] = [];
  if (g.intel > 0.55) adj.push('clever');
  if (g.size >= 9.2) adj.push('colossal');
  else if (g.tier === 4 && g.size >= 8.3 && !noun.includes('giant')) adj.push('giant');
  if (g.fur > 0.7 && g.tempOpt < 6 && g.tier === 4) adj.push('woolly');
  if (g.horns > 0.6 && !noun.includes('horn')) adj.push('long-horned');
  if (g.armor > 0.65 && !noun.includes('armor') && !noun.includes('shell')) adj.push('armored');
  if (g.toxin > 0.6 && !noun.includes('venom') && !noun.includes('poison') && !noun.includes('sting')) adj.push('venomous');
  const text = [...adj.slice(0, 2), noun].join(' ');
  return { desc: text.charAt(0).toUpperCase() + text.slice(1), icon };
}

function describePlant(g: Genome): { desc: string; icon: string } {
  const aquatic = g.habitat === 'aquatic';
  let noun: string;
  let icon: string;
  if (g.diet === 'chemo') [noun, icon] = ['vent-dwelling colony', '🪸'];
  else if (aquatic) {
    if (g.size > 3) [noun, icon] = g.tier >= 3 ? ['giant kelp', '🌿'] : ['kelp-like seaweed', '🌿'];
    else [noun, icon] = g.tier >= 4 ? ['flowering water plant', '🪷'] : g.tier === 3 ? ['sea grass', '🌿'] : ['algal mat', '🟩'];
  } else if (g.tier === 2) [noun, icon] = g.moistOpt < 0.35 ? ['lichen crust', '🟫'] : ['moss carpet', '🌱'];
  else if (g.tier === 3) {
    if (g.size < 3) [noun, icon] = ['creeping fern', '🌿'];
    else if (g.size < 5.2) [noun, icon] = ['horsetail thicket', '🎋'];
    else [noun, icon] = ['tree fern', '🌴'];
  } else if (g.size < 3) [noun, icon] = g.moistOpt < 0.72 ? ['grass', '🌾'] : ['flowering herb', '🌼'];
  else if (g.size < 5.2) [noun, icon] = g.moistOpt < 0.3 ? ['desert succulent', '🌵'] : ['shrub', '🌿'];
  else if (g.tempOpt < 9) [noun, icon] = ['conifer', '🌲'];
  else if (g.tempOpt > 21 && g.moistOpt > 0.66) [noun, icon] = ['rainforest tree', '🌴'];
  else [noun, icon] = ['broadleaf tree', '🌳'];

  const adj: string[] = [];
  if (g.size >= 8.6) adj.push('towering');
  if (g.toxin > 0.6) adj.push('poisonous');
  if (g.armor > 0.6) adj.push(g.size > 5 ? 'thick-barked' : 'thorny');
  if (g.tempOpt < 2 && !aquatic) adj.push('arctic');
  const text = [...adj.slice(0, 2), noun].join(' ');
  return { desc: text.charAt(0).toUpperCase() + text.slice(1), icon };
}

function describeVertebrate(g: Genome): [string, string] {
  const aquatic = g.habitat === 'aquatic';
  const amph = g.habitat === 'amphibious';
  const d = g.diet;
  if (aquatic) {
    if (g.fur > 0.4) return g.size >= 8 ? ['whale-like giant', '🐋'] : d === 'herb' ? ['sea cow', '🦭'] : ['seal-like swimmer', '🦭'];
    if (g.armor > 0.5) return ['armored fish', '🐡'];
    if (d === 'carn' && g.size >= 6) return ['shark-like predator', '🦈'];
    if (g.social > 0.5) return ['shoaling fish', '🐟'];
    return d === 'carn' ? ['predatory fish', '🐟'] : d === 'omni' ? ['foraging fish', '🐠'] : ['grazing fish', '🐠'];
  }
  if (amph) {
    if (g.fur > 0.4) return ['otter-like swimmer', '🦦'];
    if (g.armor > 0.4) return d === 'herb' ? ['shelled turtle', '🐢'] : ['crocodile-like ambusher', '🐊'];
    return ['amphibian', '🐸'];
  }
  if (g.flight > 0.5) {
    if (g.fur > 0.35) return d === 'herb' ? ['fruit bat', '🦇'] : ['night-flying bat', '🦇'];
    return d === 'carn' ? ['bird of prey', '🦅'] : ['seed-eating bird', '🐦'];
  }
  if (g.fur > 0.4) {
    // mammal-like
    if (d === 'herb') {
      if (g.horns > 0.6) return ['long-horned grazer', '🐂'];
      if (g.horns > 0.3) return ['horned grazer', '🐐'];
      if (g.grasp > 0.5 && g.size < 8.3) return ['tree-dwelling leaf-eater', '🦥'];
      if (g.size >= 8.3) return g.tempOpt < 6 ? ['mammoth-like browser', '🦣'] : ['giant browser', '🐘'];
      if (g.speed > 0.6) return ['swift-footed runner', '🐎'];
      if (g.size < 5) return ['small gnawer', '🐁'];
      return ['grazing beast', '🐄'];
    }
    if (d === 'carn') {
      if (g.social > 0.5) return ['pack hunter', '🐺'];
      if (g.speed > 0.6) return ['sprinting cat-like hunter', '🐆'];
      if (g.grasp > 0.5) return ['tree-stalking hunter', '🐈'];
      if (g.size >= 8) return ['giant predator', '🐅'];
      return ['stalking predator', '🦊'];
    }
    if (g.grasp > 0.5) return g.intel > 0.5 ? ['ape-like forager', '🦍'] : ['tree-climbing forager', '🐒'];
    if (g.size >= 7.5) return ['bear-like forager', '🐻'];
    return g.size < 5 ? ['scurrying forager', '🐀'] : ['rooting forager', '🐗'];
  }
  // reptile-like
  if (d === 'herb') {
    if (g.size >= 9) return ['long-necked browser', '🦕'];
    if (g.horns > 0.5) return ['horned shield-lizard', '🦏'];
    if (g.armor > 0.5) return ['tortoise-like grazer', '🐢'];
    return ['plant-eating lizard', '🦎'];
  }
  if (d === 'carn') {
    if (g.size >= 8) return ['tyrant lizard', '🦖'];
    if (g.toxin > 0.5) return ['venomous serpent', '🐍'];
    if (g.speed > 0.5) return ['swift raptor', '🦖'];
    return ['ambush lizard', '🦎'];
  }
  return g.grasp > 0.5 ? ['climbing lizard', '🦎'] : ['foraging lizard', '🦎'];
}

const SYL_A = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hy', 'Ix', 'Kal', 'Lor', 'Mor', 'Ny', 'Or', 'Pan', 'Quer', 'Rha', 'Sil', 'Tor', 'Ul', 'Ver', 'Xan', 'Zo', 'Aes', 'Bra', 'Cy', 'Den', 'Eu', 'Phy', 'Gly', 'Hel', 'Is', 'Lep', 'Mac', 'Neo', 'Oxy', 'Pter', 'Rhi', 'Ste', 'Tri'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'y', 'an', 'en', 'in', 'on', 'ar', 'er', 'or', 'al', 'el', 'os', 'ax', 'ex', 'ant', 'ent', 'ig', 'ob', 'ul', 'yr', 'ith', 'odo', 'eri', 'ano'];
const SUFFIX: Record<Kind, string[]> = {
  microbe: ['bacter', 'coccus', 'monas', 'vibrio', 'spira', 'cystis', 'ella'],
  plant: ['phyton', 'dendron', 'flora', 'phyllum', 'ia', 'anthus', 'carpus', 'pteris'],
  animal: ['us', 'ops', 'odon', 'saurus', 'therium', 'ichthys', 'ia', 'ceras', 'gnathus', 'pus', 'raptor', 'cyon'],
};
const GENERIC = ['primus', 'vulgaris', 'communis', 'novus', 'mirabilis', 'elegans', 'obscurus', 'varians', 'antiquus', 'viridis', 'ruber', 'niger', 'albus', 'modestus', 'insignis', 'dubius', 'affinis', 'simplex', 'ornatus', 'pallidus'];

export function makeGenus(g: Genome, rng: RNG): string {
  let s = rng.pick(SYL_A) + rng.pick(SYL_B);
  if (rng.chance(0.35)) s += rng.pick(SYL_B);
  return s + rng.pick(SUFFIX[kindOf(g)]);
}

export function makeEpithet(g: Genome, rng: RNG): string {
  const c: string[] = [];
  const animal = kindOf(g) === 'animal';
  if (g.intel >= SENTIENCE) return 'sapiens';
  if (animal) {
    if (g.horns > 0.6) c.push('longicornis');
    else if (g.horns > 0.3) c.push('cornutus');
    if (g.armor > 0.5) c.push('armatus', 'loricatus');
    if (g.speed > 0.6) c.push('velox', 'celer');
    if (g.grasp > 0.5) c.push('arboreus', 'scandens');
    if (g.fur > 0.5) c.push('lanatus', 'villosus');
    if (g.flight > 0.5) c.push('volans', 'alatus');
    if (g.social > 0.6) c.push('gregarius', 'socialis');
    if (g.intel > 0.5) c.push('sagax', 'callidus');
  }
  if (g.toxin > 0.5) c.push('venenatus', 'toxicus');
  if (g.size > MAX_SIZE[g.tier] - 0.8) c.push('giganteus', 'magnus', 'robustus');
  if (g.size < minSize(g) + 0.5) c.push('minor', 'nanus', 'gracilis');
  if (g.tempOpt < 5) c.push('borealis', 'glacialis', 'nivalis');
  if (g.tempOpt > 30) c.push('thermophilus', 'tropicus', 'ardens');
  if (g.habitat === 'aquatic') c.push('marinus', 'pelagicus');
  else {
    if (g.moistOpt < 0.3) c.push('deserti', 'xerophilus', 'arenarius');
    if (g.moistOpt > 0.75) c.push('paludosus', 'pluvialis');
  }
  if (c.length && rng.chance(0.65)) return rng.pick(c);
  return rng.pick(GENERIC);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Body mass in kg for the abstract size scale. */
export function massKg(size: number): number {
  return Math.pow(10, 1.6 * size - 11);
}

export function formatMass(size: number): string {
  const kg = massKg(size);
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1));
  if (kg >= 1000) return `${fmt(kg / 1000)} t`;
  if (kg >= 1) return `${fmt(kg)} kg`;
  if (kg >= 1e-3) return `${fmt(kg * 1e3)} g`;
  if (kg >= 1e-6) return `${fmt(kg * 1e6)} mg`;
  if (kg >= 1e-9) return `${fmt(kg * 1e9)} µg`;
  return `${fmt(kg * 1e12)} ng`;
}

const BIG = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion'];

/** Turn simulated biomass into a headcount that feels right for the creature's size. */
export function formatHeadcount(biomass: number, size: number): string {
  const n = (biomass * 2e4) / massKg(size);
  if (n < 1000) return Math.max(1, Math.round(n)).toString();
  const e = Math.min(BIG.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(10, e * 3);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${BIG[e]}`;
}
