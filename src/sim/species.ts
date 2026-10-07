import { clamp, describe, isAuto, kindOf, type Genome, type Kind } from './genome';

export const D_CHEMO = 0;
export const D_PHOTO = 1;
export const D_HERB = 2;
export const D_CARN = 3;
export const D_OMNI = 4;

const DIET_CODE = { chemo: D_CHEMO, photo: D_PHOTO, herb: D_HERB, carn: D_CARN, omni: D_OMNI } as const;

/**
 * A snapshot of how a species is doing where it lives, averaged over its range and weighted by
 * numbers. Comparing a snapshot from its heyday with one from its decline tells why it is failing.
 */
export interface Diagnosis {
  tick: number;
  rate: number;
  /** Overall fitness of the places it lives, and its factors (1 = perfect). */
  fit: number;
  tF: number;
  pF: number;
  mF: number;
  oF: number;
  /** Mean conditions where it lives. */
  temp: number;
  ph: number;
  moist: number;
  /** Per-capita drag from rivals (comp), from its own crowding against the food or light on offer (self), from hunters and grazers. */
  comp: number;
  compBy: number;
  self: number;
  pred: number;
  predBy: number;
  graze: number;
  grazeBy: number;
  /** Its most important food, for eaters. */
  food: number;
}

/** Numbers the simulation needs every tick, pre-computed from a genome. */
export interface Derived {
  auto: boolean;
  dietCode: number;
  /** Intrinsic fitness on open ground and under a closed canopy. */
  fitOpen: number;
  fitForest: number;
  rate: number;
  disp: number;
  defOpen: number;
  defForest: number;
  offOpen: number;
  offForest: number;
  effH: number;
  effC: number;
  kBonus: number;
  /** 0..1: how much this autotroph contributes to a closed canopy. */
  tall: number;
  /** Share of a grazer's bite that is actually lost. Grasses grow back from the base, so they shrug it off. */
  grazeLoss: number;
  /** Share of the population a fire kills. Low plants survive on their roots; trees burn. */
  fireLoss: number;
  /** 0..1: how much a land animal suffers in dry country without fresh water nearby. */
  thirst: number;
  /** How far it will travel to drink: big bodies walk far, wings go further still. */
  reach: number;
}

export function derive(g: Genome): Derived {
  const auto = isAuto(g);
  const cost = auto
    ? 0.22 * g.toxin + 0.18 * g.armor + 0.05 * g.immunity + 0.1 * g.roots + 0.12 * g.frost
    : 0.07 * g.horns + 0.12 * g.armor + 0.08 * g.speed + 0.05 * g.grasp + 0.02 * g.fur + 0.12 * g.flight + 0.04 * g.social + 0.26 * g.intel + 0.05 * g.immunity + 0.14 * g.toxin;
  // fast breeders compete poorly; generalists pay for their breadth
  let base = (1 - cost) * (1.1 - 0.25 * g.fertility);
  base *= 1 - 0.012 * (g.tempTol - 4);
  base *= 1 - 0.05 * (g.phTol - 0.5);
  if (g.habitat !== 'aquatic') base *= 1 - 0.25 * (g.moistTol - 0.1);
  if (g.habitat === 'amphibious') base *= 0.92;

  let open = base;
  let forest = base;
  if (!auto) {
    // on open ground, big plant-eaters settle their quarrels over the best grazing with their horns
    if (g.diet !== 'carn' && g.size >= 5) open = base * (1 + 0.12 * g.horns);
    // horns snag, bulk cannot pass, speed is wasted; grasping hands open up the canopy
    forest = base * (1 - 0.75 * g.horns) * (1 - 0.5 * clamp((g.size - 6.5) / 3, 0, 1)) * (1 - 0.25 * g.speed) * (1 + 0.3 * g.grasp * clamp((8.5 - g.size) / 3, 0, 1));
  }

  const speedEff = g.speed * (1 - 0.5 * g.armor);
  // An animal lives or dies by its best trick, with a little help from its second best. This is
  // what pushes lineages to specialise into runners, tanks, flyers, climbers or poisoners.
  const defOpen = best(0.9 * speedEff, 0.9 * g.horns, 0.8 * g.armor, 0.8 * g.flight, 0.6 * g.toxin) + 0.35 * g.social + 0.3 * g.intel;
  const defForest = best(0.3 * speedEff, 0.2 * g.horns, 0.8 * g.armor, 0.7 * g.flight, 0.6 * g.toxin, 0.9 * g.grasp) + 0.25 * g.social + 0.3 * g.intel + 0.25 * (1 - g.size / 10);
  const offOpen = 0.2 + best(0.9 * speedEff, 0.5 * g.flight, 0.4 * g.toxin) + 0.5 * g.social + 0.35 * g.intel;
  const offForest = 0.3 + best(0.4 * speedEff, 0.8 * g.grasp, 0.4 * g.flight, 0.4 * g.toxin) + 0.3 * g.social + 0.35 * g.intel;

  let disp: number;
  if (g.tier <= 1) disp = 0.15;
  else if (g.habitat === 'aquatic') disp = auto ? 0.08 : 0.1 + 0.08 * g.speed;
  else if (auto) disp = 0.05 + 0.08 * g.fertility + (g.tier >= 4 ? 0.04 : 0);
  else disp = 0.04 + 0.1 * speedEff + 0.12 * g.flight + 0.03 * g.fertility;

  const synergy = 0.5 * g.social + 0.5 * g.grasp;
  return {
    auto,
    dietCode: DIET_CODE[g.diet],
    fitOpen: open,
    fitForest: forest,
    rate: 0.5 * (0.6 + 0.8 * g.fertility) * (1.25 - 0.07 * g.size),
    disp,
    defOpen,
    defForest,
    offOpen,
    offForest,
    effH: g.diet === 'herb' ? 0.2 : g.diet === 'omni' ? 0.11 : 0,
    effC: g.diet === 'carn' ? 0.25 : g.diet === 'omni' ? 0.14 : 0,
    kBonus: auto ? 1 : 1 + 0.7 * g.intel * (0.15 + 0.85 * synergy),
    tall: auto ? clamp((g.size - 4.2) / 2.5, 0, 1) : 0,
    grazeLoss: grazeLoss(g),
    fireLoss: fireLoss(g),
    thirst: thirstOf(g),
    reach: 0.45 + 0.07 * g.size + 0.6 * g.flight,
  };
}

/** Land animals need to drink; small invertebrates live off the water in their food, desert dwellers off very little. */
function thirstOf(g: Genome): number {
  if (isAuto(g) || g.habitat === 'aquatic' || g.tier < 3) return 0;
  const body = g.tier === 3 ? 0.45 : g.habitat === 'amphibious' ? 0.7 : 1;
  return body * (0.4 + 0.6 * clamp(g.moistOpt / 0.45, 0, 1));
}

/** Fitness left to a thirsty animal in a cell with this rainfall and this much fresh water nearby. */
export function thirstFit(d: Derived, rain: number, drink: number): number {
  if (d.thirst <= 0) return 1;
  const dry = clamp((0.45 - rain) / 0.3, 0, 1);
  return 1 - 0.55 * d.thirst * dry * (1 - Math.min(1, drink * d.reach));
}

/** The strongest of several options, plus a quarter of the runner-up. */
function best(...v: number[]): number {
  let a = 0;
  let b = 0;
  for (const x of v) {
    if (x > a) {
      b = a;
      a = x;
    } else if (x > b) b = x;
  }
  return a + 0.25 * b;
}

/**
 * Complex body plans are more efficient, which is what makes them worth evolving. On land the step is
 * bigger: roots, pipes and seeds let ferns push out mosses, and flowering plants push out ferns.
 */
export function tierBonusOf(g: Genome): number {
  return 1 + (isAuto(g) && g.habitat !== 'aquatic' ? 0.075 : 0.04) * g.tier;
}

/** Low land plants of the flowering kind (grasses and herbs) regrow from the base after grazing. */
export function grazeLoss(g: Genome): number {
  if (!isAuto(g) || g.habitat === 'aquatic' || g.size > 4.2) return 1;
  // the lower the plant, the more of it is out of reach below the bite
  return g.tier >= 4 ? 0.3 + 0.5 * clamp((g.size - 1.5) / 2.7, 0, 1) : g.tier === 3 ? 0.8 : 1;
}

function fireLoss(g: Genome): number {
  if (!isAuto(g)) return 0.35 * (1 - 0.8 * g.flight) * (1 - 0.4 * g.speed);
  const tall = clamp((g.size - 4.2) / 2.5, 0, 1);
  const base = tall > 0 ? 0.55 + 0.3 * tall : g.tier >= 4 && g.size < 3 ? 0.15 : 0.4;
  // thick bark shields the stem; deep roots sprout again once the fire has passed
  return base * (1 - 0.5 * g.armor) * (1 - 0.55 * g.roots);
}

/** Competition felt by `a` from one unit of `b` sharing the same cell. */
export function pairAlpha(a: Genome, b: Genome): number {
  const autoA = isAuto(a);
  if (autoA !== isAuto(b)) return 0;
  const ds = a.size - b.size;
  if (autoA) {
    if (a.diet !== b.diet) return 0;
    const overlap = 0.3 + 0.7 * Math.exp(-(ds * ds) / 4.5);
    // on land the taller plant steals the light
    const shade = a.habitat !== 'aquatic' && b.habitat !== 'aquatic' && b.size > a.size ? clamp((b.size - a.size) / 4, 0, 0.6) : 0;
    return Math.min(1.4, overlap + shade);
  }
  let dietOverlap: number;
  if (a.diet === b.diet) dietOverlap = 1;
  else if (a.diet === 'omni' || b.diet === 'omni') dietOverlap = 0.55;
  else dietOverlap = 0;
  // animals that live differently share less: insects and backboned animals, flyers and walkers,
  // climbers in the canopy and grazers on the ground
  const plan = a.tier === b.tier ? 1 : 0.5;
  const air = 1 - 0.5 * Math.abs(a.flight - b.flight);
  const canopy = 1 - 0.35 * Math.abs(a.grasp - b.grasp);
  return dietOverlap * (0.15 + 0.85 * Math.exp(-(ds * ds) / 2.88)) * plan * air * canopy;
}

/** How much of an autotroph a plant-eater can actually use (0..1). */
export function pairEdible(eater: Genome, food: Genome): number {
  if (eater.diet !== 'herb' && eater.diet !== 'omni') return 0;
  if (!isAuto(food)) return 0;
  let e = 1;
  const ds = eater.size - food.size;
  if (eater.size < 1.5 && food.size > 3) e *= 0.25;
  if (ds > 4) e *= Math.exp(-((ds - 4) * (ds - 4)) / 3);
  if (food.size > 5 && food.habitat !== 'aquatic') {
    // tall browsers, climbers and flyers reach the leaves; insects crawl up the trunk and live on them
    const insect = eater.tier === 3 && eater.habitat !== 'aquatic' ? 0.75 : 0;
    const reach = Math.max(clamp((eater.size - 6) / 2.5, 0, 1), eater.grasp, 0.8 * eater.flight, insect);
    e *= 0.2 + 0.8 * reach;
  }
  // a flying body cannot carry a big gut: birds and bats take seeds and fruit, not leaves
  if (eater.tier >= 4) e *= 1 - 0.45 * eater.flight;
  return e * (1 - 0.5 * food.toxin) * (1 - 0.35 * food.armor);
}

/** How vulnerable prey is to a predator, on open ground and in forest. */
export function pairAccess(pred: Genome, dPred: Derived, prey: Genome, dPrey: Derived): [number, number] {
  if ((pred.diet !== 'carn' && pred.diet !== 'omni') || dPrey.auto) return [0, 0];
  const ideal = 1 - 1.5 * pred.social; // packs take prey larger than themselves
  const d = pred.size - prey.size - ideal;
  const sizeMatch = Math.exp(-(d * d) / 3.38);
  // agile flyers snatch smaller animals on the wing: birds and bats live on insects
  const hawk = prey.size < pred.size ? 0.35 * pred.flight : 0;
  const open = sizeMatch * clamp(0.55 + 0.6 * (dPred.offOpen - dPrey.defOpen) + hawk, 0.03, 1);
  const forest = sizeMatch * clamp(0.55 + 0.6 * (dPred.offForest - dPrey.defForest) + hawk, 0.03, 1);
  return [open, forest];
}

export class Species {
  id = 0;
  slot = -1;
  genus = '';
  epithet = '';
  desc = '';
  icon = '';
  kind: Kind = 'microbe';
  color: [number, number, number] = [255, 255, 255];
  hue = 0;
  parentId = -1;
  bornTick = 0;
  bornYear = 0;
  diedTick = -1;
  diedYear = -1;
  genome: Genome;
  derived: Derived;

  totalPop = 0;
  cells = 0;
  peakPop = 0;
  /** Total biomass sampled at regular intervals since birth. */
  history: number[] = [];
  established = false;
  sentient = false;
  /** Ticks of heightened mutation left (the mutagen power). */
  mutagen = 0;
  /** Tick of the last catastrophe that hit this species, and what it was. */
  lastHitTick = -1000;
  lastHit = '';
  children = 0;
  /** Consecutive ticks spent below a viable population. */
  lowTicks = 0;
  /** How it was doing at its best, and lately. */
  baseline: Diagnosis | null = null;
  latest: Diagnosis | null = null;
  /** Why it is shrinking, while it is; and why it died out, once it has. */
  declineReason = '';
  deathCause = '';
  /** Biomass lost over its whole history, by cause. */
  losses = { hunted: 0, grazed: 0, hunger: 0, plague: 0, fire: 0, disaster: 0 };
  /** Biomass of this species eaten by each other species (by id), and what it ate of each. */
  eatenBy = new Map<number, number>();
  ate = new Map<number, number>();
  /** Number of map cells it occupied, sampled alongside `history`. */
  rangeHistory: number[] = [];
  /** Tick of the first `history` sample. */
  historyStart = -1;
  /** The continents it reached, in order. */
  reached: { name: string; year: number }[] = [];
  /** Until this step the species is sheltered by the player: nothing eats it and rivals press it less. */
  shelterUntil = -1;
  /** Made by the player in the lab or with guided evolution: never culled to make room, only by nature. */
  playerMade = false;

  constructor(genome: Genome) {
    this.genome = genome;
    this.derived = derive(genome);
    this.refreshLook();
  }

  get name(): string {
    return `${this.genus} ${this.epithet}`;
  }

  get alive(): boolean {
    return this.diedTick < 0;
  }

  refreshLook(): void {
    this.derived = derive(this.genome);
    const d = describe(this.genome);
    this.desc = d.desc;
    this.icon = d.icon;
    this.kind = kindOf(this.genome);
  }
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
