import { CLS_WET, H, M_LUT, M_WATER, N, P_LUT, T_LUT, W, World } from './world';
import { RNG } from './rng';
import { CarbonCycle } from './earth';
import { buildRegions, type Region } from './regions';
import {
  SENTIENCE,
  clamp,
  habFactors,
  isAuto,
  makeEpithet,
  makeGenus,
  moistResponse,
  mutate,
  o2Factor,
  phResponse,
  sanitize,
  tempResponse,
  type Genome,
  type MutEnv,
} from './genome';
import { D_CHEMO, D_PHOTO, Species, derive, type Diagnosis, tierBonusOf, hslToRgb, pairAccess, pairAlpha, pairEdible } from './species';

export const MAXS = 260; // population slots (hard cap on living species)
export const SOFT_CAP = 210; // above this, only major innovations found new species
export const HARD_CAP = 250; // above this, a newcomer may push out a faltering, redundant species
/** Steps a new species is left alone before it can be made to give way to another. */
export const GRACE = 200;
export const KSCALE = 1000;
export const MINP = 0.02;
export const MAINT = 0.08;
export const G_INTAKE = 0.5;
export const TOTAL_TICKS = 6000;
export const TOTAL_YEARS = 4_000_000_000;
export const MAX_ENERGY = 100;
export const ENERGY_REGEN = 0.28;
export const HIST_EVERY = 8;
/** Steps a volcano keeps smoking after an eruption. */
export const VOLCANO_LIFE = 400;
export type DifficultyId = 'gentle' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  icon: string;
  blurb: string;
  startEnergy: number;
  /** Multiplier on how fast divine energy returns. */
  regen: number;
  /** Multiplier on the price of every divine act. */
  cost: number;
  /** Multiplier on natural fires, eruptions, impacts and plagues. */
  disasters: number;
  edenTarget: number;
  /** Animal species that must have lived before Dominion can be won. */
  dominionAnimals: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'gentle', name: 'Gentle', icon: '🌱', blurb: 'Plenty of divine energy, cheap miracles and a calm planet.', startEnergy: 100, regen: 1.8, cost: 0.6, disasters: 0.5, edenTarget: 45, dominionAnimals: 6 },
  { id: 'normal', name: 'Normal', icon: '⚖️', blurb: 'The world as it was meant to be.', startEnergy: 60, regen: 1, cost: 1, disasters: 1, edenTarget: 60, dominionAnimals: 8 },
  { id: 'hard', name: 'Hard', icon: '🔥', blurb: 'Scarce energy, costly miracles and a restless planet full of fire, ash and plague.', startEnergy: 30, regen: 0.75, cost: 1.3, disasters: 1.6, edenTarget: 70, dominionAnimals: 10 },
];

export const EDEN_TARGET = 60;

export type GoalId = 'awakening' | 'dominion' | 'eden' | 'sandbox';

export interface GoalInfo {
  id: GoalId;
  name: string;
  icon: string;
  blurb: string;
}

export const GOALS: GoalInfo[] = [
  { id: 'awakening', name: 'The Awakening', icon: '✨', blurb: 'Raise a species that becomes aware of its own existence within four billion years.' },
  { id: 'dominion', name: 'Dominion', icon: '👑', blurb: 'Let one animal species wipe out every other animal on the planet.' },
  { id: 'eden', name: 'Garden of Eden', icon: '🌺', blurb: 'Nurture a world teeming with life: 45 to 70 kinds of plants and animals side by side, depending on difficulty.' },
  { id: 'sandbox', name: 'Sandbox', icon: '🪐', blurb: 'No goal and unlimited divine power. Just play God.' },
];

export interface LogEvent {
  tick: number;
  year: number;
  icon: string;
  text: string;
  speciesId?: number;
  cell?: number;
  major?: boolean;
}

export interface VisualEffect {
  id: number;
  type: 'meteor' | 'volcano' | 'spark' | 'arrive' | 'plague';
  cell: number;
  radius: number;
}

export interface Plague {
  kind: 'acute' | 'genotoxic' | 'retroviral';
  id: number;
  speciesId: number;
  name: string;
  state: Uint8Array;
  active: number[];
  mortality: number;
  spread: number;
  duration: number;
  startPop: number;
  /** Biomass the sickness has killed so far. */
  killed: number;
  natural: boolean;
}

/** How a (possibly imagined) genome would fare as a newcomer in a set of places. */
export interface Forecast {
  /** Mean per-capita growth rate as a rare newcomer; above zero it can take hold. */
  growth: number;
  /** 0..5 for the player. */
  stars: number;
  /** The most important reasons, worst first; good news last. */
  notes: string[];
  /** The best spot found for it, for releasing it there. */
  bestCell: number;
  /** How many of the sampled places it could live in at all. */
  habitable: number;
}

export interface HistorySample {
  tick: number;
  o2: number;
  co2: number;
  temp: number;
  species: number;
  bio: number;
}

export type AtmKey = 'co2' | 'o2' | 'ch4' | 'so2' | 'sun' | 'seaLevel';

export const ATM_RANGE: Record<AtmKey, { min: number; max: number; log?: boolean }> = {
  co2: { min: 50, max: 8000, log: true },
  o2: { min: 0, max: 35 },
  ch4: { min: 0, max: 200 },
  so2: { min: 0, max: 100 },
  sun: { min: -15, max: 15 },
  seaLevel: { min: -0.3, max: 0.3 },
};

/** Geological epochs sample short ecological episodes; a step is not an organism's generation. */
export function yearAt(tick: number): number {
  return Math.max(0, tick) * TOTAL_YEARS / TOTAL_TICKS;
}

const DEME_W = 16, DEME_H = 15, DEMES = (W / DEME_W) * (H / DEME_H);
const demeAt = (c: number) => Math.floor(c / W / DEME_H) * (W / DEME_W) + Math.floor(c % W / DEME_W);

const PLAGUE_A = ['Red', 'Grey', 'Black', 'Pale', 'Weeping', 'Creeping', 'Silent', 'Burning', 'Withering', 'Shivering', 'Spotted', 'Hollow'];
const PLAGUE_B = ['Rot', 'Fever', 'Wasting', 'Blight', 'Pox', 'Murrain', 'Sleep', 'Scourge', 'Canker', 'Ague'];

const MILESTONE_AGE: [string, string][] = [
  ['sentient', 'Age of Mind'],
  ['advanced', 'Age of Beasts'],
  ['landAnimal', 'Age of Crawlers'],
  ['tree', 'Age of Forests'],
  ['landPlant', 'Age of Green Shores'],
  ['complex', 'Age of Shells and Claws'],
  ['animal', 'Age of Soft Bodies'],
  ['multicellular', 'Age of Algae'],
  ['eukaryote', 'Age of Cells'],
  ['photo', 'Age of Sunlight'],
];

export class Sim {
  readonly world: World;
  readonly rng: RNG;
  readonly seed: number;
  readonly goal: GoalId;
  readonly sandbox: boolean;
  readonly diff: Difficulty;
  /** The world divided into named lands and seas. */
  readonly regions: Region[];
  readonly regionOf: Int16Array;

  tick = 0;
  year = 0;
  status: 'running' | 'won' | 'lost' = 'running';
  endTitle = '';
  endText = '';
  /** Set once the player chooses to keep watching after the game has been decided. */
  freePlay = false;
  energy = 60;
  age = 'Age of Microbes';

  /** Every species that ever lived, indexed by id. */
  species: Species[] = [];
  alive: Species[] = [];
  readonly aliveSlots = new Int32Array(MAXS);
  nAlive = 0;
  private slots: (Species | null)[] = new Array(MAXS).fill(null);

  /** Biomass per cell and slot, laid out cell-major for cache-friendly per-cell work. */
  readonly pop = new Float32Array(N * MAXS);
  private tLut = new Float32Array(MAXS * T_LUT);
  private pLut = new Float32Array(MAXS * P_LUT);
  private mLut = new Float32Array(MAXS * M_LUT);
  readonly hab = new Float32Array(MAXS * 4);
  private fitOpen = new Float32Array(MAXS);
  private fitForest = new Float32Array(MAXS);
  private o2f = new Float32Array(MAXS);
  private rate = new Float32Array(MAXS);
  private disp = new Float32Array(MAXS);
  private effH = new Float32Array(MAXS);
  private effC = new Float32Array(MAXS);
  private kBonus = new Float32Array(MAXS);
  private tall = new Float32Array(MAXS);
  private grazeLoss = new Float32Array(MAXS);
  private dietCode = new Uint8Array(MAXS);
  private alpha = new Float32Array(MAXS * MAXS);
  private edible = new Float32Array(MAXS * MAXS);
  private accO = new Float32Array(MAXS * MAXS);
  private accF = new Float32Array(MAXS * MAXS);
  private totPop = new Float64Array(MAXS);
  private totCells = new Int32Array(MAXS);
  /** Food eaten this step: eater slot × food slot. Flushed into the species' records every step. */
  private eatMat = new Float64Array(MAXS * MAXS);
  /** 1 for species under God's protection this step. */
  private shelter = new Uint8Array(MAXS);
  /** Biomass lost this step to a failing growth balance: hunger, crowding, a hostile climate. */
  private hungerLoss = new Float64Array(MAXS);
  // scratch buffers for the per-cell loop
  private ps = new Int32Array(MAXS);
  private pp = new Float64Array(MAXS);
  private fit = new Float64Array(MAXS);
  private gain = new Float64Array(MAXS);
  private loss = new Float64Array(MAXS);

  oceanPhoto = 0;
  landPhoto = 0;
  chemoBio = 0;
  heteroBio = 0;
  private oceanRef = 1;
  private landRef = 1;
  private chemoRef = 1;
  /** Where the air is naturally heading, for the trend arrows in the UI. */
  eq = { o2: 0, co2: 1200, ch4: 30 };

  fires: number[] = [];
  /** Volcanoes that have erupted, newest last. They stay on the map as landmarks. */
  volcanoes: { cell: number; tick: number }[] = [];
  plagues: Plague[] = [];
  events: LogEvent[] = [];
  effects: VisualEffect[] = [];
  history: HistorySample[] = [];
  milestones = new Set<string>();
  animalsEver = 0;
  private recentExtinctions: number[] = [];
  private lastMassExtinction = -1000;
  private iceAge = false;
  private hothouse = false;
  private usedNames = new Set<string>();
  private nextEffect = 1;
  private nextPlague = 1;
  climateDirty = true;
  /** Once land life has taken over, the seas and the microbes stop bringing forth new species. */
  readonly carbon = new CarbonCycle();
  private lastGeologyYear = 0;
  private readonly movingPop = new Float32Array(N * MAXS);
  private readonly localT = new Float32Array(MAXS * DEMES);
  private readonly localPh = new Float32Array(MAXS * DEMES);
  private readonly localM = new Float32Array(MAXS * DEMES);
  // Frequency of a pre-existing resistance allele; selection can change this locally.
  private readonly resistance = new Float32Array(MAXS * DEMES).fill(0.5);

  constructor(seed: number, goal: GoalId, difficulty: DifficultyId = 'normal') {
    this.diff = DIFFICULTIES.find((d) => d.id === difficulty) ?? DIFFICULTIES[1];
    this.energy = this.diff.startEnergy;
    this.seed = seed;
    this.goal = goal;
    this.sandbox = goal === 'sandbox';
    if (this.sandbox) this.energy = MAX_ENERGY;
    this.rng = new RNG(seed ^ 0x51ed270b);
    this.world = new World(seed);
    ({ regions: this.regions, regionOf: this.regionOf } = buildRegions(this.world, seed));
    this.computeReferences();
    this.seedLife();
    this.log('🌊', 'In the warm, lightless depths, something begins to copy itself.', { major: true });
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /** Reference biomasses of a fully living planet, used to scale the gas exchange of the biosphere. */
  private computeReferences(): void {
    const w = this.world;
    let ocean = 0;
    let land = 0;
    let chemo = 0;
    for (let c = 0; c < N; c++) {
      const min = w.baseMinerals[c];
      if (w.isWater[c]) {
        const shallow = w.cls[c] === 1;
        ocean += KSCALE * w.light[c] * (shallow ? 0.5 + 0.5 * min : 0.1 + 0.3 * min) * 0.6;
        chemo += KSCALE * w.chemoProd[c] * 0.6;
      } else if (w.moist[c] > 0.25) {
        land += KSCALE * w.light[c] * (0.3 + 0.7 * min) * 0.6;
      }
    }
    this.oceanRef = Math.max(1, ocean);
    this.landRef = Math.max(1, land);
    this.chemoRef = Math.max(1, chemo);
  }

  private seedLife(): void {
    const w = this.world;
    let sumT = 0;
    let nWater = 0;
    for (let c = 0; c < N; c++) {
      if (w.isWater[c]) {
        sumT += w.temp[c];
        nWater++;
      }
    }
    const luca: Genome = {
      tier: 0,
      diet: 'chemo',
      habitat: 'aquatic',
      size: 0.2,
      tempOpt: sumT / Math.max(1, nWater),
      tempTol: 14,
      phOpt: w.ph[w.isWater.indexOf(1)] ?? 7.5,
      phTol: 1.5,
      moistOpt: 0.5,
      moistTol: 0.3,
      horns: 0,
      armor: 0,
      speed: 0,
      grasp: 0,
      fur: 0,
      flight: 0,
      social: 0,
      intel: 0,
      immunity: 0.1,
      toxin: 0,
      fertility: 0.5,
      roots: 0,
      frost: 0,
    };
    sanitize(luca);
    const sp = this.addSpecies(luca, null, true);
    if (!sp) return;
    sp.genus = 'Protobion';
    sp.epithet = 'primus';
    sp.established = true;
    for (let c = 0; c < N; c++) {
      if (w.isWater[c]) this.pop[c * MAXS + sp.slot] = KSCALE * w.chemoProd[c] * 0.3;
    }
  }

  // -------------------------------------------------------------------------
  // Species bookkeeping
  // -------------------------------------------------------------------------

  private addSpecies(genome: Genome, parent: Species | null, major: boolean): Species | null {
    let slot = -1;
    for (let s = 0; s < MAXS; s++) {
      if (!this.slots[s]) {
        slot = s;
        break;
      }
    }
    if (slot < 0) return null;
    const sp = new Species(genome);
    sp.id = this.species.length;
    sp.slot = slot;
    for (let d = 0; d < DEMES; d++) {
      const i = d * MAXS + slot;
      this.localT[i] = this.localPh[i] = this.localM[i] = 0;
      this.resistance[i] = 0.5;
    }
    sp.parentId = parent ? parent.id : -1;
    sp.bornTick = this.tick;
    sp.bornYear = this.year;

    // name: a major innovation founds a new genus
    if (!parent || major) sp.genus = makeGenus(genome, this.rng);
    else sp.genus = parent.genus;
    for (let tries = 0; tries < 12; tries++) {
      sp.epithet = makeEpithet(genome, this.rng);
      if (!this.usedNames.has(sp.name)) break;
      if (tries === 8) sp.genus = makeGenus(genome, this.rng);
    }
    if (this.usedNames.has(sp.name)) sp.epithet += ` ${sp.id}`;
    this.usedNames.add(sp.name);

    // colour: plants green, microbes blue-violet, animals warm; close kin look alike
    const range: [number, number] = sp.kind === 'plant' ? [70, 165] : sp.kind === 'microbe' ? [170, 285] : [300, 415];
    if (parent && !major && parent.kind === sp.kind) sp.hue = clamp(parent.hue + this.rng.range(-14, 14), range[0], range[1]);
    else sp.hue = this.rng.range(range[0], range[1]);
    sp.color = hslToRgb(sp.hue, 0.6 + this.rng.next() * 0.25, 0.55 + this.rng.next() * 0.15);

    if (parent) parent.children++;
    this.species.push(sp);
    this.slots[slot] = sp;
    this.alive.push(sp);
    this.aliveSlots[this.nAlive++] = slot;
    this.rebuildTables(sp);
    return sp;
  }

  /** Fill the lookup tables and interaction matrices for one species. */
  private rebuildTables(sp: Species): void {
    const s = sp.slot;
    const g = sp.genome;
    const d = sp.derived;
    for (let i = 0; i < T_LUT; i++) this.tLut[s * T_LUT + i] = tempResponse(g, i / 2 - 40);
    for (let i = 0; i < P_LUT; i++) this.pLut[s * P_LUT + i] = phResponse(g, i / 10);
    for (let i = 0; i <= 100; i++) this.mLut[s * M_LUT + i] = moistResponse(g, i / 100);
    this.mLut[s * M_LUT + M_WATER] = 1;
    const hf = habFactors(g);
    for (let k = 0; k < 4; k++) this.hab[s * 4 + k] = hf[k];
    // complex body plans are a little more efficient, which is what makes them worth evolving
    const tierBonus = tierBonusOf(g);
    this.fitOpen[s] = d.fitOpen * tierBonus;
    this.fitForest[s] = d.fitForest * tierBonus;
    this.o2f[s] = o2Factor(g, this.world.atm.o2, this.world.atm.co2);
    this.rate[s] = d.rate;
    this.disp[s] = d.disp;
    this.effH[s] = d.effH;
    this.effC[s] = d.effC;
    this.kBonus[s] = d.kBonus;
    this.tall[s] = d.tall;
    this.grazeLoss[s] = d.grazeLoss;
    this.dietCode[s] = d.dietCode;
    for (const o of this.alive) {
      const t = o.slot;
      this.alpha[s * MAXS + t] = pairAlpha(g, o.genome);
      this.alpha[t * MAXS + s] = pairAlpha(o.genome, g);
      this.edible[s * MAXS + t] = pairEdible(g, o.genome);
      this.edible[t * MAXS + s] = pairEdible(o.genome, g);
      if (t === s) {
        this.accO[s * MAXS + s] = 0;
        this.accF[s * MAXS + s] = 0;
        continue;
      }
      const a = pairAccess(g, d, o.genome, o.derived);
      this.accO[s * MAXS + t] = a[0];
      this.accF[s * MAXS + t] = a[1];
      const b = pairAccess(o.genome, o.derived, g, d);
      this.accO[t * MAXS + s] = b[0];
      this.accF[t * MAXS + s] = b[1];
    }
  }

  /** Call after changing a living species' genome in place. */
  refreshSpecies(sp: Species): void {
    sanitize(sp.genome);
    sp.refreshLook();
    if (sp.alive) this.rebuildTables(sp);
  }

  private extinct(sp: Species, cause = ''): void {
    // the reason is settled before the last of them vanish from the map
    if (!cause) {
      const recent = this.tick - sp.lastHitTick < 40 ? sp.lastHit : '';
      if (recent === 'plague') cause = 'it was wiped out by plague';
      else if (recent === 'fire') cause = 'the last of them were lost to the flames';
      else if (recent === 'impact') cause = 'the impact destroyed its last refuges';
      else if (recent === 'eruption') cause = 'its last refuges were buried in ash';
      else {
        const d = this.diagnose(sp);
        if (d) sp.latest = d;
        cause = this.explain(sp) || 'its numbers dwindled until too few were left to carry on';
      }
    }
    sp.deathCause = cause;
    sp.declineReason = '';
    const s = sp.slot;
    for (let c = 0; c < N; c++) this.pop[c * MAXS + s] = 0;
    this.slots[s] = null;
    this.alive.splice(this.alive.indexOf(sp), 1);
    this.nAlive = 0;
    for (const o of this.alive) this.aliveSlots[this.nAlive++] = o.slot;
    sp.diedTick = this.tick;
    sp.diedYear = this.year;
    sp.totalPop = 0;
    sp.cells = 0;
    sp.slot = -1;
    this.plagues = this.plagues.filter((p) => p.speciesId !== sp.id);
    if (!sp.established) return;
    this.recentExtinctions.push(this.tick);
    const lived = sp.diedYear - sp.bornYear;
    const notable = sp.diedTick - sp.bornTick > 300 || sp.sentient;
    if (notable) this.log('💀', `${sp.name} (${sp.desc.toLowerCase()}) died out after ${fmtYears(lived)}: ${cause}.`, { speciesId: sp.id });
  }

  // -------------------------------------------------------------------------
  // The tick
  // -------------------------------------------------------------------------

  step(): void {
    if (this.status !== 'running' && !this.freePlay) return;
    this.tick++;
    const previousYear = this.year;
    this.year = yearAt(this.tick);
    if (this.tick % 8 === 0) this.moveContinents();
    for (const sp of this.alive) this.shelter[sp.slot] = sp.shelterUntil > this.tick ? 1 : 0;
    this.updateAtmosphere(this.year - previousYear);
    if (this.climateDirty || this.tick % 4 === 0) {
      this.world.updateClimate();
      this.climateDirty = false;
    }
    const atm = this.world.atm;
    for (const sp of this.alive) this.o2f[sp.slot] = o2Factor(sp.genome, atm.o2, atm.co2);
    this.populationStep();
    this.updateFires();
    this.updatePlagues();
    this.naturalEvents();
    this.longDistanceDispersal();
    this.finishStats();
    this.speciate();
    this.checkClimateNews();
    this.checkGoal();
    if (!this.sandbox) this.energy = Math.min(MAX_ENERGY, this.energy + ENERGY_REGEN * this.diff.regen);
    if (this.tick % HIST_EVERY === 0) {
      this.history.push({ tick: this.tick, o2: atm.o2, co2: atm.co2, temp: this.world.meanTemp, species: this.nAlive, bio: this.oceanPhoto + this.landPhoto + this.chemoBio + this.heteroBio });
    }
  }

  private moveContinents(): void {
    const w = this.world;
    const oldOwner = w.tectonics.owner.slice();
    const oldLand = w.isWater.slice();
    const shifts = w.advanceGeology(this.lastGeologyYear, this.year);
    this.lastGeologyYear = this.year;
    this.movingPop.fill(0);
    const fields = [this.localT, this.localPh, this.localM, this.resistance];
    const carried = fields.map(() => new Float64Array(MAXS * DEMES));
    const massByDeme = new Float64Array(MAXS * DEMES);
    const carry = (c: number, nc: number, slot: number, mass: number) => {
      this.movingPop[nc * MAXS + slot] += mass;
      const from = demeAt(c) * MAXS + slot, to = demeAt(nc) * MAXS + slot;
      massByDeme[to] += mass;
      for (let f = 0; f < fields.length; f++) carried[f][to] += fields[f][from] * mass;
    };
    // Carry land populations with their crust; floating/swimming populations stay in water coordinates.
    for (let c = 0; c < N; c++) {
      const p = oldOwner[c];
      const shift = p >= 0 && !oldLand[c] ? shifts[p] : { dx: 0, dy: 0 };
      const x = ((c % W + shift.dx) % W + W) % W;
      const y = clamp(Math.floor(c / W) + shift.dy, 0, H - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      for (const sp of this.alive) {
        const mass = this.pop[c * MAXS + sp.slot];
        if (!mass) continue;
        if (sp.genome.habitat === 'aquatic') { carry(c, c, sp.slot, mass); continue; }
        for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
          const nc = Math.min(H - 1, y0 + iy) * W + (x0 + ix) % W;
          carry(c, nc, sp.slot, mass * (ix ? fx : 1 - fx) * (iy ? fy : 1 - fy));
        }
      }
    }
    this.pop.set(this.movingPop);
    for (let i = 0; i < massByDeme.length; i++) if (massByDeme[i] > 0) {
      for (let f = 0; f < fields.length; f++) fields[f][i] = carried[f][i] / massByDeme[i];
    }
    this.refreshRegions();
    this.climateDirty = true;
  }

  private refreshRegions(): void {
    const next = buildRegions(this.world, this.seed);
    this.regions.splice(0, this.regions.length, ...next.regions);
    this.regionOf.set(next.regionOf);
  }

  private updateAtmosphere(years: number): void {
    const a = this.world.atm;
    const before = { ...a };
    const production = Math.min(1.5, this.oceanPhoto / this.oceanRef) * 0.4 + Math.min(1.5, this.landPhoto / this.landRef) * 0.7;
    this.carbon.step(a, years, production, this.heteroBio / Math.max(1, this.oceanRef), this.world.meanTemp - 15);
    const ch4eq = (1 + 40 * Math.min(1, this.chemoBio / this.chemoRef)) / (1 + a.o2 * 1.5);
    a.ch4 += (ch4eq - a.ch4) * (1 - Math.exp(-years / 20e6));
    // Aerosols and outbreaks are sampled ecological episodes, not literal million-year events.
    a.so2 *= 0.96;
    a.dust *= 0.95;
    a.co2 = clamp(a.co2, 50, 8000);
    a.ch4 = clamp(a.ch4, 0, 200);
    this.eq.o2 = clamp(a.o2 + (a.o2 - before.o2) * 30, 0, 35);
    this.eq.co2 = clamp(a.co2 + (a.co2 - before.co2) * 30, 50, 8000);
    this.eq.ch4 = ch4eq;
  }

  /** Relative damage after generic cellular repair. Exposure also creates undirected variation. */
  exposureFitness(c: number): number {
    return Math.exp(-0.012 * this.world.radiation[c] - 0.045 * this.world.uv[c]);
  }

  localGenome(sp: Species, c: number): Genome {
    const i = demeAt(c) * MAXS + sp.slot;
    return { ...sp.genome, tempOpt: sp.genome.tempOpt + this.localT[i], phOpt: sp.genome.phOpt + this.localPh[i],
      moistOpt: sp.genome.moistOpt + this.localM[i], immunity: clamp(sp.genome.immunity + (this.resistance[i] - 0.5) * 0.2, 0, 1) };
  }

  /** Growth, competition, grazing, predation and local spread, cell by cell. */
  private populationStep(): void {
    const w = this.world;
    const { cls, ti, pi, mi, canopy, cover, plankton, photoProd, chemoProd, nb, isWater } = w;
    const { pop, tLut, pLut, mLut, hab, fitOpen, fitForest, o2f, rate, disp, effH, effC, kBonus, tall, grazeLoss, dietCode, alpha, edible, accO, accF, aliveSlots, totPop, totCells, ps, pp, fit, gain, loss, eatMat, hungerLoss } = this;
    const nAlive = this.nAlive;
    totPop.fill(0);
    totCells.fill(0);
    let oceanPhoto = 0;
    let landPhoto = 0;
    let chemoBio = 0;
    let heteroBio = 0;
    let rs = (this.rng.next() * 4294967296) >>> 0;

    for (let c = 0; c < N; c++) {
      const base = c * MAXS;
      let n = 0;
      for (let k = 0; k < nAlive; k++) {
        const s = aliveSlots[k];
        const p = pop[base + s];
        if (p > 0) {
          ps[n] = s;
          pp[n] = p;
          n++;
        }
      }
      if (n === 0) {
        canopy[c] *= 0.6;
        cover[c] *= 0.6;
        plankton[c] *= 0.6;
        continue;
      }
      const cl = cls[c];
      const tI = ti[c];
      const pI = pi[c];
      const mI = mi[c];
      const cnp = canopy[c];
      const Kp = KSCALE * photoProd[c];
      const Kc = KSCALE * chemoProd[c];
      const exposure = this.exposureFitness(c);
      const demeBase = demeAt(c) * MAXS;

      for (let a = 0; a < n; a++) {
        const s = ps[a];
        const i = demeBase + s;
        const t = clamp(Math.round(tI - this.localT[i] * 2), 0, T_LUT - 1);
        const p = clamp(Math.round(pI - this.localPh[i] * 10), 0, P_LUT - 1);
        const m = mI === M_WATER ? M_WATER : clamp(Math.round(mI - this.localM[i] * 100), 0, 100);
        fit[a] = tLut[s * T_LUT + t] * pLut[s * P_LUT + p] * mLut[s * M_LUT + m] * hab[s * 4 + cl] * (fitOpen[s] + (fitForest[s] - fitOpen[s]) * cnp) * o2f[s] * exposure;
        loss[a] = 0;
      }

      for (let a = 0; a < n; a++) {
        const s = ps[a];
        const P = pp[a];
        const row = s * MAXS;
        const d = dietCode[s];
        let C = 0;
        for (let b = 0; b < n; b++) C += alpha[row + ps[b]] * pp[b];
        if (this.shelter[s]) C *= 0.45;
        let K: number;
        if (d === D_PHOTO) K = Kp;
        else if (d === D_CHEMO) K = Kc;
        else {
          const eH = effH[s];
          const eC = effC[s];
          let Fp = 0;
          let Fc = 0;
          if (eH > 0) for (let b = 0; b < n; b++) Fp += edible[row + ps[b]] * pp[b];
          if (eC > 0) {
            for (let b = 0; b < n; b++) {
              const o = accO[row + ps[b]];
              Fc += (o + (accF[row + ps[b]] - o) * cnp) * pp[b];
            }
          }
          const wH = eH * Fp;
          const wC = eC * Fc;
          const wT = wH + wC;
          K = kBonus[s] * wT;
          if (wT > 0) {
            const intake = G_INTAKE * P;
            if (wH > 0) {
              let cons = (intake * wH) / wT;
              if (cons > 0.5 * Fp) cons = 0.5 * Fp;
              const q = cons / Fp;
              for (let b = 0; b < n; b++) {
                const e = edible[row + ps[b]];
                if (e > 0) {
                  const eaten = q * e * pp[b] * grazeLoss[ps[b]];
                  loss[b] += eaten;
                  eatMat[row + ps[b]] += eaten;
                }
              }
            }
            if (wC > 0) {
              let cons = (intake * wC) / wT;
              if (cons > 0.5 * Fc) cons = 0.5 * Fc;
              const q = cons / Fc;
              for (let b = 0; b < n; b++) {
                const o = accO[row + ps[b]];
                const acc = o + (accF[row + ps[b]] - o) * cnp;
                if (acc > 0) {
                  const eaten = q * acc * pp[b];
                  loss[b] += eaten;
                  eatMat[row + ps[b]] += eaten;
                }
              }
            }
          }
        }
        let g = K > 1e-6 ? fit[a] - MAINT - C / K : -0.6;
        if (g < -0.6) g = -0.6;
        gain[a] = rate[s] * P * g;
      }

      let can = 0;
      let cov = 0;
      const water = isWater[c] === 1;
      for (let a = 0; a < n; a++) {
        const s = ps[a];
        const P0 = pp[a];
        let l = loss[a];
        if (l > 0.7 * P0) l = 0.7 * P0;
        if (this.shelter[s]) l = 0;
        let P = P0 + gain[a] - l;
        if (gain[a] < 0) hungerLoss[s] -= gain[a];
        if (P < MINP) {
          pop[base + s] = 0;
          continue;
        }
        if (P > 0.2) {
          // spill into one random neighbour that offers the right kind of ground
          rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0;
          const nc = nb[c * 4 + (rs >>> 30)];
          if (nc >= 0 && hab[s * 4 + cls[nc]] > 0.02) {
            const idx = nc * MAXS + s;
            const pn = pop[idx];
            if (pn < P) {
              let amt = disp[s] * (P - pn) * 0.5;
              if (pn === 0 && amt < MINP * 2) amt = ((rs >>> 6) & 0xffff) / 65536 < amt / (MINP * 2) ? MINP * 2 : 0;
              if (amt > 0) {
                P -= amt;
                pop[idx] = pn + amt;
              }
            }
          }
        }
        pop[base + s] = P;
        totPop[s] += P;
        totCells[s]++;
        const d = dietCode[s];
        if (d === D_PHOTO) {
          if (water) oceanPhoto += P;
          else landPhoto += P;
          can += P * tall[s];
          cov += P * (1 - tall[s]);
        } else if (d === D_CHEMO) chemoBio += P;
        else heteroBio += P;
      }
      const newCan = Math.min(1, can / (KSCALE * 0.3));
      canopy[c] = canopy[c] * 0.6 + newCan * 0.4;
      if (water) {
        plankton[c] = plankton[c] * 0.6 + Math.min(1, cov / (KSCALE * 0.25)) * 0.4;
        cover[c] = 0;
      } else {
        cover[c] = cover[c] * 0.6 + Math.min(1, cov / (KSCALE * 0.25)) * 0.4;
        plankton[c] = 0;
      }
    }
    this.oceanPhoto = oceanPhoto;
    this.landPhoto = landPhoto;
    this.chemoBio = chemoBio;
    this.heteroBio = heteroBio;
  }

  /** Rare leaps: flyers crossing straits, castaways on driftwood, spores on the wind. */
  private longDistanceDispersal(): void {
    const w = this.world;
    for (let i = 0; i < 48; i++) {
      const c = this.rng.int(N);
      const base = c * MAXS;
      for (let k = 0; k < this.nAlive; k++) {
        const s = this.aliveSlots[k];
        const p = this.pop[base + s];
        if (p < 1) continue;
        const g = this.slots[s]!.genome;
        let radius = 0;
        if (g.flight > 0.3) radius = 2 + 6 * g.flight;
        // seeds of flowering plants ride the wind and the guts of animals
        else if (g.tier >= 3 && g.habitat !== 'aquatic' && this.slots[s]!.derived.auto && this.rng.chance((g.tier >= 4 ? 0.12 : 0.04) + 0.3 * g.fertility)) radius = 3 + 3 * g.fertility;
        else if (g.habitat !== 'aquatic' && w.distCoast[c] <= 1 && this.rng.chance(0.03)) radius = 4;
        else if (g.habitat === 'aquatic' && this.rng.chance(0.01)) radius = 3;
        if (radius <= 0) continue;
        const dx = Math.round(this.rng.range(-radius, radius));
        const dy = Math.round(this.rng.range(-radius, radius));
        const y = Math.floor(c / W) + dy;
        if (y < 0 || y >= H) continue;
        const x = ((c % W) + dx + W) % W;
        const t = y * W + x;
        if (this.hab[s * 4 + w.cls[t]] > 0.5 && this.pop[t * MAXS + s] === 0) this.pop[t * MAXS + s] = Math.max(MINP * 10, p * 0.02);
      }
    }
  }

  /** Move this step's meals and losses into each species' lifetime record. */
  private flushLedger(): void {
    const { eatMat, hungerLoss } = this;
    for (const a of this.alive) {
      const row = a.slot * MAXS;
      for (const b of this.alive) {
        const v = eatMat[row + b.slot];
        if (v <= 0) continue;
        a.ate.set(b.id, (a.ate.get(b.id) ?? 0) + v);
        b.eatenBy.set(a.id, (b.eatenBy.get(a.id) ?? 0) + v);
        if (b.derived.auto) b.losses.grazed += v;
        else b.losses.hunted += v;
      }
      a.losses.hunger += hungerLoss[a.slot];
    }
    eatMat.fill(0);
    hungerLoss.fill(0);
  }

  /** Which named continents a species lives on now; new arrivals go into its record. */
  private trackRange(sp: Species): void {
    const w = this.world;
    const seen = new Set<number>();
    for (let c = 0; c < N; c++) {
      if (w.isWater[c] || this.pop[c * MAXS + sp.slot] <= MINP) continue;
      seen.add(w.continent[c]);
    }
    for (const id of seen) {
      const cont = w.continents[id];
      if (!cont?.name || cont.size < 60) continue;
      if (!sp.reached.some((r) => r.name === cont.name)) sp.reached.push({ name: cont.name, year: this.year });
    }
  }

  private finishStats(): void {
    this.flushLedger();
    const sample = this.tick % HIST_EVERY === 0;
    for (const sp of this.alive.slice()) {
      const s = sp.slot;
      sp.totalPop = this.totPop[s];
      sp.cells = this.totCells[s];
      if (sp.totalPop > sp.peakPop) sp.peakPop = sp.totalPop;
      const age = this.tick - sp.bornTick;
      if (age >= 2 && sp.totalPop < 0.5) {
        this.extinct(sp);
        continue;
      }
      // a species reduced to a scattering of individuals cannot hold on for long
      if (sp.totalPop < viablePop(sp) && sp.shelterUntil <= this.tick) {
        if (++sp.lowTicks > (sp.established ? 40 : 25)) {
          this.extinct(sp);
          continue;
        }
      } else sp.lowTicks = 0;
      if ((this.tick + sp.id * 7) % 30 === 0 && age > 20) this.adaptInPlace(sp);
      if (!sp.established && age >= 15 && sp.cells >= 4) {
        sp.established = true;
        this.onEstablished(sp);
      }
      if (sample) {
        if (sp.historyStart < 0) sp.historyStart = this.tick;
        sp.history.push(sp.totalPop);
        sp.rangeHistory.push(sp.cells);
      }
      if (sp.genome.habitat !== 'aquatic' && (this.tick + sp.id * 3) % 50 === 0) this.trackRange(sp);
      if (sp.mutagen > 0) sp.mutagen--;
      // keep a record of its heyday, and watch closely once it is in trouble
      if (sp.established) {
        const phase = (this.tick + sp.id) % 25;
        if (phase === 0 && (!sp.baseline || sp.totalPop >= 0.85 * sp.peakPop)) sp.baseline = this.diagnose(sp);
        const failing = sp.totalPop < 0.55 * sp.peakPop || sp.lowTicks > 0;
        if (failing && phase % 8 === 0) {
          sp.latest = this.diagnose(sp);
          sp.declineReason = this.explain(sp);
        } else if (!failing) sp.declineReason = '';
      }
    }
    // a wave of deaths in a short span is a mass extinction
    const horizon = this.tick - 30;
    while (this.recentExtinctions.length && this.recentExtinctions[0] < horizon) this.recentExtinctions.shift();
    const lost = this.recentExtinctions.length;
    if (lost >= 8 && lost >= 0.3 * (this.nAlive + lost) && this.tick - this.lastMassExtinction > 120) {
      this.lastMassExtinction = this.tick;
      this.log('☠️', `Mass extinction: ${lost} species have vanished in a geological instant.`, { major: true });
    }
  }

  // -------------------------------------------------------------------------
  // Speciation
  // -------------------------------------------------------------------------

  /** Local variants arise blindly; differential survival, drift and gene flow change their frequency. */
  private adaptInPlace(sp: Species): void {
    const c = this.randomOccupiedCell(sp);
    if (c < 0) return;
    const i = demeAt(c) * MAXS + sp.slot;
    const resident = this.localGenome(sp, c);
    const variant = { ...resident };
    const trait = this.rng.pick(['tempOpt', 'phOpt', 'moistOpt'] as const);
    variant[trait] += this.rng.gauss() * (trait === 'tempOpt' ? 1.5 : trait === 'phOpt' ? 0.12 : 0.04);
    sanitize(variant);
    const oldFit = this.staticFitness(resident, c), newFit = this.staticFitness(variant, c);
    // Nearly neutral variants sometimes persist through drift; harmful changes usually disappear.
    if (newFit > oldFit || (Math.abs(newFit - oldFit) < 0.005 && this.rng.chance(0.1))) {
      this.localT[i] = clamp(variant.tempOpt - sp.genome.tempOpt, -12, 12);
      this.localPh[i] = clamp(variant.phOpt - sp.genome.phOpt, -1, 1);
      this.localM[i] = clamp(variant.moistOpt - sp.genome.moistOpt, -0.25, 0.25);
    }
    // Gene flow only across occupied neighbouring patches, never an instant global sweep.
    for (let tries = 0; tries < 12; tries++) {
      const from = this.randomOccupiedCell(sp);
      if (from < 0) break;
      const to = this.world.nb[from * 4 + this.rng.int(4)];
      if (to < 0 || this.pop[to * MAXS + sp.slot] <= MINP) continue;
      const a = demeAt(from) * MAXS + sp.slot, b = demeAt(to) * MAXS + sp.slot;
      if (a === b) continue;
      for (const field of [this.localT, this.localPh, this.localM, this.resistance]) {
        const flow = (field[a] - field[b]) * 0.03;
        field[a] -= flow; field[b] += flow;
      }
    }
  }

  private speciate(): void {
    const crowd = Math.max(0, 1 - this.nAlive / SOFT_CAP);
    const lonely = 1 + 6 / (this.nAlive + 1);
    for (const sp of this.alive.slice()) {
      if (sp.cells < 3) continue;
      let p = 0.025 * (0.4 + Math.min(1.6, sp.cells / 400)) * lonely;
      if (sp.genome.tier <= 1 || sp.kind === 'animal') p *= 1.5;
      if (sp.mutagen > 0) p *= 5;
      const c = this.randomOccupiedCell(sp);
      if (c >= 0) p *= 1 + 0.15 * this.world.radiation[c] + 0.2 * this.world.uv[c];
      if (this.rng.chance(p)) this.trySpeciate(sp, { crowd });
    }
  }

/**
   * May this species be made to give way to a newcomer? Never while it is young, growing, under
   * God's protection, made by God, or the only mind in the world.
   */
  private cullable(o: Species): boolean {
    if (!o.established || o.sentient || o.playerMade || o.shelterUntil > this.tick) return false;
    if (this.tick - o.bornTick < GRACE) return false;
    const h = o.history;
    if (h.length >= 4 && h[h.length - 1] > h[h.length - 4] * 1.05) return false;
    return true;
  }

  /** Local fitness of a genome at a cell, computed directly (used outside the hot loop). */
  staticFitness(g: Genome, c: number): number {
    const w = this.world;
    const d = derive(g);
    const hf = habFactors(g)[w.cls[c]];
    if (hf <= 0) return 0;
    const m = w.isWater[c] ? 1 : moistResponse(g, w.moist[c]);
    const body = (d.fitOpen + (d.fitForest - d.fitOpen) * w.canopy[c]) * tierBonusOf(g);
    return tempResponse(g, w.temp[c]) * phResponse(g, w.ph[c]) * m * hf * body * o2Factor(g, w.atm.o2, w.atm.co2) * this.exposureFitness(c);
  }

  /**
   * Try to split a daughter species off a parent. Most attempts fail: the mutant must be able to
   * live where it is born and must not be clearly worse than its parent there.
   */
  trySpeciate(parent: Species, opts: { crowd?: number; atCell?: number; force?: (g: Genome) => void } = {}): Species | null {
    if (!parent.alive || this.nAlive >= MAXS - 2) return null;
    const w = this.world;
    let seed = opts.atCell ?? this.randomOccupiedCell(parent);
    if (seed < 0) return null;
    let target = seed;
    if (opts.atCell === undefined) {
      let frontier = false;
      if (this.rng.chance(0.3)) {
        // life presses against its borders: look for a shore, a coast, a place the parent cannot use
        for (let tries = 0; tries < 16 && !frontier; tries++) {
          const c = this.randomOccupiedCell(parent);
          const nc = c < 0 ? -1 : w.nb[c * 4 + this.rng.int(4)];
          if (nc >= 0 && this.hab[parent.slot * 4 + w.cls[nc]] <= 0.01) {
            seed = c;
            target = nc;
            frontier = true;
          }
        }
      }
      if (!frontier && this.rng.chance(0.35)) {
        // or the edge of its range: drier, colder or saltier ground of the same kind that it has not won
        // yet. Of a few such places, the one whose climate differs most from its own is tried.
        let bestGap = -1;
        for (let tries = 0; tries < 24; tries++) {
          const c = this.randomOccupiedCell(parent);
          if (c < 0) break;
          const y = Math.floor(c / W) + this.rng.int(7) - 3;
          const x = ((c % W) + this.rng.int(7) - 3 + W) % W;
          if (y < 0 || y >= H) continue;
          const nc = y * W + x;
          if (this.hab[parent.slot * 4 + w.cls[nc]] > 0.02 && this.pop[nc * MAXS + parent.slot] < MINP * 5) {
            const gap = Math.abs(w.temp[nc] - parent.genome.tempOpt) + (w.isWater[nc] ? 0 : 20 * Math.abs(w.moist[nc] - parent.genome.moistOpt));
            if (gap > bestGap) {
              bestGap = gap;
              seed = c;
              target = nc;
              frontier = true;
            }
          }
        }
      }
      if (!frontier) {
        const y = Math.floor(seed / W) + this.rng.int(5) - 2;
        const x = ((seed % W) + this.rng.int(5) - 2 + W) % W;
        if (y >= 0 && y < H) target = y * W + x;
      }
    }

    // what does the neighbourhood already offer?
    const env: MutEnv = {
      t: w.temp[target],
      ph: w.ph[target],
      m: w.moist[target],
      cls: w.cls[target],
      o2: w.atm.o2,
      parentHab: this.hab[parent.slot * 4 + w.cls[target]],
      hasAutoFood: false,
      hasPrey: false,
      hasHerb: false,
      hasCarn: false,
      tierOpen: !this.alive.some((o) => o.genome.tier > parent.genome.tier && o.derived.auto === parent.derived.auto && sameGrowthForm(o, parent)),
    };
    for (const o of this.alive) {
      if (this.pop[target * MAXS + o.slot] <= MINP) continue;
      if (o.derived.auto) env.hasAutoFood = true;
      else {
        if (o !== parent) env.hasPrey = true;
        if (o.genome.diet === 'herb' || o.genome.diet === 'omni') env.hasHerb = true;
        if (o.genome.diet === 'carn') env.hasCarn = true;
      }
    }

    let child: Genome;
    let major: string | null;
    if (opts.force) {
      child = { ...parent.genome };
      opts.force(child);
      sanitize(child);
      major = null;
    } else {
      const res = mutate(this.localGenome(parent, seed), this.rng, env);
      if (!res) return null;
      child = res.g;
      major = res.major;
      if (habFactors(child)[w.cls[target]] <= 0.02) return null;
      // natural selection: the mutant must be able to grow from rarity in the living community
      const com = this.community(target);
      const gChild = this.invasionRate(child, target, com, parent);
      if (gChild <= (major ? 0.02 : 0.004)) return null;
      if (!major) {
        const edge = gChild - this.invasionRate(parent.genome, target, com, parent);
        if (edge <= 0.01) return null;
        if (!this.rng.chance(opts.crowd ?? 1)) return null;
      }
    }
    if (habFactors(child)[w.cls[target]] <= 0.02) return null;

    // a niche holds only so many similar species; a newcomer may only push out a faltering one
    if (!opts.force) {
      const key = guildKey(child);
      const members = this.alive.filter((o) => guildKey(o.genome) === key);
      if (members.length >= (child.tier <= 1 ? 2 : 4)) {
        let weakest: Species | null = null;
        for (const o of members) if (o !== parent && this.cullable(o) && (!weakest || o.totalPop < weakest.totalPop)) weakest = o;
        if (!weakest || weakest.totalPop > 0.05 * parent.totalPop) return null;
        this.extinct(weakest, `it was crowded out of its niche by a new offshoot of ${parent.name}, which lives the same way`);
      } else if (this.nAlive >= HARD_CAP) {
        // the world is full: a faltering species that a much larger relative already covers makes way.
        // If there is none, the newcomer simply does not arise.
        const biggest = new Map<string, number>();
        for (const o of this.alive) {
          const k = guildKey(o.genome);
          biggest.set(k, Math.max(biggest.get(k) ?? 0, o.totalPop));
        }
        let weakest: Species | null = null;
        let worst = Infinity;
        for (const o of this.alive) {
          if (o === parent || !this.cullable(o)) continue;
          const ratio = o.totalPop / (biggest.get(guildKey(o.genome)) ?? 0);
          if (ratio > 0.1) continue;
          if (ratio < worst) {
            worst = ratio;
            weakest = o;
          }
        }
        if (!weakest) return null;
        this.extinct(weakest, 'the world filled up with species, and it was the most marginal of those living the same way');
      }
    }

    const sp = this.addSpecies(child, parent, major !== null);
    if (!sp) return null;
    if (opts.force) {
      // a divine reshaping: part of the parent population around the chosen place is transformed
      this.forRadius(target, 3, (c) => {
        const idx = c * MAXS + parent.slot;
        const moved = this.pop[idx] * 0.4;
        if (moved > 0 && this.hab[sp.slot * 4 + w.cls[c]] > 0.02) {
          this.pop[idx] -= moved;
          this.pop[c * MAXS + sp.slot] += moved;
        }
      });
      if (this.pop[target * MAXS + sp.slot] < 1) this.plant(sp, target, 1);
      return sp;
    }
    const src = seed * MAXS + parent.slot;
    const founders = Math.max(1, Math.min(this.pop[src] * 0.3, 60));
    this.pop[src] = Math.max(0, this.pop[src] - founders * 0.5);
    this.plant(sp, target, founders);
    return sp;
  }

  /** Measure how a species is faring where it lives (a sample of its cells, weighted by numbers). */
  diagnose(sp: Species): Diagnosis | null {
    if (!sp.alive) return null;
    const w = this.world;
    const s = sp.slot;
    const occ: number[] = [];
    for (let c = 0; c < N; c++) if (this.pop[c * MAXS + s] > 0.02) occ.push(c);
    if (!occ.length) return null;
    for (let i = occ.length - 1; i > 0 && i >= occ.length - 90; i--) {
      const j = this.rng.int(i + 1);
      const t = occ[i];
      occ[i] = occ[j];
      occ[j] = t;
    }
    const sample = occ.slice(Math.max(0, occ.length - 90));
    const d: Diagnosis = { tick: this.tick, rate: this.rate[s], fit: 0, tF: 0, pF: 0, mF: 0, oF: 0, temp: 0, ph: 0, moist: 0, comp: 0, compBy: -1, self: 0, pred: 0, predBy: -1, graze: 0, grazeBy: -1, food: -1 };
    const compBy = new Map<number, number>();
    const predBy = new Map<number, number>();
    const grazeBy = new Map<number, number>();
    const foodBy = new Map<number, number>();
    let W = 0;
    let landW = 0;
    for (const c of sample) {
      const P = this.pop[c * MAXS + s];
      W += P;
      const cnp = w.canopy[c];
      const local = this.localGenome(sp, c);
      const tF = tempResponse(local, w.temp[c]);
      const pF = phResponse(local, w.ph[c]);
      const mF = w.isWater[c] ? 1 : moistResponse(local, w.moist[c]);
      const oF = this.o2f[s];
      const fit = tF * pF * mF * this.hab[s * 4 + w.cls[c]] * (this.fitOpen[s] + (this.fitForest[s] - this.fitOpen[s]) * cnp) * oF;
      d.fit += P * fit;
      d.tF += P * tF;
      d.pF += P * pF;
      d.oF += P * oF;
      d.temp += P * w.temp[c];
      d.ph += P * w.ph[c];
      if (!w.isWater[c]) {
        d.mF += P * mF;
        d.moist += P * w.moist[c];
        landW += P;
      }
      const com = this.community(c);
      // what it needs: light and minerals for plants, food for eaters
      let K: number;
      const dc = this.dietCode[s];
      if (dc === D_PHOTO) K = KSCALE * w.photoProd[c];
      else if (dc === D_CHEMO) K = KSCALE * w.chemoProd[c];
      else {
        K = 0;
        for (let i = 0; i < com.list.length; i++) {
          const o = com.list[i];
          if (o === sp) continue;
          const e = this.effH[s] * this.edible[s * MAXS + o.slot] + this.effC[s] * (this.accO[s * MAXS + o.slot] + (this.accF[s * MAXS + o.slot] - this.accO[s * MAXS + o.slot]) * cnp);
          const v = e * com.pops[i];
          K += v;
          if (v > 0) foodBy.set(o.id, (foodBy.get(o.id) ?? 0) + v * P);
        }
        K *= this.kBonus[s];
      }
      K = Math.max(K, 1e-3);
      for (let i = 0; i < com.list.length; i++) {
        const o = com.list[i];
        const a = this.alpha[s * MAXS + o.slot] * com.pops[i];
        if (o === sp) d.self += (P * this.rate[s] * a) / K;
        else if (a > 0) {
          const v = (this.rate[s] * a) / K;
          d.comp += P * v;
          compBy.set(o.id, (compBy.get(o.id) ?? 0) + P * v);
        }
        if (o === sp) continue;
        if (com.qC[i] > 0) {
          const acc = this.accO[o.slot * MAXS + s] + (this.accF[o.slot * MAXS + s] - this.accO[o.slot * MAXS + s]) * cnp;
          const v = com.qC[i] * acc;
          if (v > 0) {
            d.pred += P * v;
            predBy.set(o.id, (predBy.get(o.id) ?? 0) + P * v);
          }
        }
        if (com.qH[i] > 0) {
          const v = com.qH[i] * this.edible[o.slot * MAXS + s] * this.grazeLoss[s];
          if (v > 0) {
            d.graze += P * v;
            grazeBy.set(o.id, (grazeBy.get(o.id) ?? 0) + P * v);
          }
        }
      }
    }
    for (const k of ['fit', 'tF', 'pF', 'oF', 'temp', 'ph', 'comp', 'self', 'pred', 'graze'] as const) d[k] /= W;
    d.mF = landW > 0 ? d.mF / landW : 1;
    d.moist = landW > 0 ? d.moist / landW : 1;
    const top = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    d.compBy = top(compBy);
    d.predBy = top(predBy);
    d.grazeBy = top(grazeBy);
    d.food = top(foodBy);
    return d;
  }

  /**
   * Why is this species failing? Whatever got most worse between its heyday and now: the climate,
   * hunters, grazers, rivals or its food. Returns an empty string when nothing stands out.
   */
  explain(sp: Species): string {
    const now = sp.latest;
    if (!now) return '';
    const base = sp.baseline && sp.baseline.tick < now.tick ? sp.baseline : null;
    const g = sp.genome;
    const name = (id: number) => this.species[id]?.name ?? 'another species';
    const fate = (id: number) => (this.species[id] && !this.species[id].alive ? ' (now extinct itself)' : '');
    const cands: [number, string][] = [];

    // the place itself turned hostile
    const drops: [number, string][] = [
      [(base ? base.tF : 1) - now.tF, now.temp > g.tempOpt ? `the climate grew too hot for it (around ${Math.round(now.temp)} °C where it lived, against the ${Math.round(g.tempOpt)} °C it was built for)` : `the climate grew too cold for it (around ${Math.round(now.temp)} °C where it lived, against the ${Math.round(g.tempOpt)} °C it was built for)`],
      [(base ? base.pF : 1) - now.pF, now.ph < g.phOpt ? `its ${g.habitat === 'aquatic' ? 'waters' : 'soils'} turned too acidic (pH ${now.ph.toFixed(1)})` : `its ${g.habitat === 'aquatic' ? 'waters' : 'soils'} turned too alkaline (pH ${now.ph.toFixed(1)})`],
      [(base ? base.mF : 1) - now.mF, now.moist < g.moistOpt ? 'the land dried out under it' : 'the land grew too wet for it'],
      [(base ? base.oF : 1) - now.oF, g.diet === 'chemo' && g.tier === 0 ? 'rising oxygen stressed this oxygen-sensitive lineage' : 'there was too little oxygen in the air for a body like this'],
    ];
    drops.sort((a, b) => b[0] - a[0]);
    const envScore = (base ? Math.max(0, base.fit - now.fit) : Math.max(0, 0.5 - now.fit)) * now.rate;
    if (drops[0][0] > 0.05) cands.push([envScore, drops[0][1]]);

    const dPred = now.pred - (base?.pred ?? 0);
    if (now.predBy >= 0) cands.push([dPred, `it was hunted down by ${name(now.predBy)}${fate(now.predBy)}`]);
    const dGraze = now.graze - (base?.graze ?? 0);
    if (now.grazeBy >= 0) cands.push([dGraze, `it was grazed away by ${name(now.grazeBy)}${fate(now.grazeBy)}`]);
    const dComp = now.comp - (base?.comp ?? 0);
    if (now.compBy >= 0) cands.push([dComp, `it was outcompeted by ${name(now.compBy)}${fate(now.compBy)}, which lives the same way`]);

    // its own needs outgrew what the place offers
    const dSelf = now.self - (base?.self ?? 0);
    if (sp.derived.auto) {
      const co2 = this.world.atm.co2 < 160 && g.diet === 'photo';
      cands.push([dSelf, co2 ? 'there was too little carbon dioxide left in the air to feed it' : g.diet === 'photo' ? 'its ground offered less and less: too little light, warmth or minerals' : 'the vents and minerals it lived on gave out']);
    } else {
      const food = base?.food ?? now.food;
      const f = food >= 0 && food !== now.food ? `its main food, ${name(food)}, became scarce${fate(food)}` : food >= 0 ? `it starved as its food, ${name(food)}${fate(food)}, grew scarce` : 'it starved: there was too little left to eat';
      cands.push([dSelf, f]);
    }

    cands.sort((a, b) => b[0] - a[0]);
    return cands[0] && cands[0][0] > 0.002 ? cands[0][1] : '';
  }

  /** Who lives in a cell, and how hard each of them grazes (qH) and hunts (qC) per unit of food. */
  community(c: number): { list: Species[]; pops: number[]; qH: number[]; qC: number[] } {
    const base = c * MAXS;
    const cnp = this.world.canopy[c];
    const list: Species[] = [];
    const pops: number[] = [];
    for (const o of this.alive) {
      const pv = this.pop[base + o.slot];
      if (pv > MINP) {
        list.push(o);
        pops.push(pv);
      }
    }
    const qH = new Array<number>(list.length).fill(0);
    const qC = new Array<number>(list.length).fill(0);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const eH = o.derived.effH;
      const eC = o.derived.effC;
      if (eH <= 0 && eC <= 0) continue;
      const row = o.slot * MAXS;
      let Fp = 0;
      let Fc = 0;
      for (let j = 0; j < list.length; j++) {
        const t = list[j].slot;
        if (eH > 0) Fp += this.edible[row + t] * pops[j];
        if (eC > 0) {
          const a = this.accO[row + t];
          Fc += (a + (this.accF[row + t] - a) * cnp) * pops[j];
        }
      }
      const wH = eH * Fp;
      const wC = eC * Fc;
      const wT = wH + wC;
      if (wT <= 0) continue;
      const intake = G_INTAKE * pops[i];
      if (wH > 0) qH[i] = Math.min((intake * wH) / wT, 0.5 * Fp) / Fp;
      if (wC > 0) qC[i] = Math.min((intake * wC) / wT, 0.5 * Fc) / Fc;
    }
    return { list, pops, qH, qC };
  }

  /**
   * Per-capita growth a genome would enjoy as a rare newcomer in a cell: its fit to the place,
   * the crowding by competitors, the food on offer and the toll taken by whatever eats it.
   * `self` is treated as the same kind (no feeding on, or being fed on by, its own parent).
   */
  private invasionRate(g: Genome, c: number, com: { list: Species[]; pops: number[]; qH: number[]; qC: number[] }, self: Species): number {
    const w = this.world;
    const fitHere = this.staticFitness(g, c);
    if (fitHere <= 0) return -1;
    const d = derive(g);
    const cnp = w.canopy[c];
    let C = 0;
    let Fp = 0;
    let Fc = 0;
    let lossRate = 0;
    for (let i = 0; i < com.list.length; i++) {
      const o = com.list[i];
      const P = com.pops[i];
      C += pairAlpha(g, o.genome) * P;
      if (d.effH > 0) Fp += pairEdible(g, o.genome) * P;
      if (o === self) continue;
      if (d.effC > 0) {
        const a = pairAccess(g, d, o.genome, o.derived);
        Fc += (a[0] + (a[1] - a[0]) * cnp) * P;
      }
      if (com.qH[i] > 0) lossRate += com.qH[i] * pairEdible(o.genome, g) * d.grazeLoss;
      if (com.qC[i] > 0) {
        const a = pairAccess(o.genome, o.derived, g, d);
        lossRate += com.qC[i] * (a[0] + (a[1] - a[0]) * cnp);
      }
    }
    let K: number;
    if (g.diet === 'photo') K = KSCALE * w.photoProd[c];
    else if (g.diet === 'chemo') K = KSCALE * w.chemoProd[c];
    else K = d.kBonus * (d.effH * Fp + d.effC * Fc);
    if (K <= 1e-6) return -1;
    return d.rate * Math.max(-0.6, fitHere - MAINT - C / K) - lossRate;
  }

  /**
   * How would this genome fare if it arrived, rare, in these places? Its fit to the climate, the food on
   * offer, the rivals and the hunters are weighed just as the simulation does it, and the worst problems
   * are named. `self` (if given) is left out of the picture, as if it had not been there.
   */
  forecast(g: Genome, cells: number[], self: Species | null = null, maxSamples = 10, comCache?: Map<number, ReturnType<Sim['community']>>): Forecast {
    const w = this.world;
    const hf = habFactors(g);
    const ok = cells.filter((c) => hf[w.cls[c]] > 0.02);
    const out: Forecast = { growth: -1, stars: 0, notes: [], bestCell: -1, habitable: ok.length };
    if (!ok.length) {
      out.notes.push(g.habitat === 'aquatic' ? 'it cannot leave the water' : g.habitat === 'terrestrial' ? 'it would drown here' : 'there is no shore here for it');
      return out;
    }
    const step = Math.max(1, Math.floor(ok.length / maxSamples));
    const d = derive(g);
    let n = 0;
    let growth = 0;
    let tF = 0;
    let pF = 0;
    let mF = 0;
    let oF = 0;
    let temp = 0;
    let ph = 0;
    let moist = 0;
    let land = 0;
    let food = 0;
    let crowd = 0;
    let danger = 0;
    let best = -Infinity;
    const rivals = new Map<number, number>();
    const hunters = new Map<number, number>();
    for (let i = Math.floor(step / 2); i < ok.length; i += step) {
      const c = ok[i];
      let com = comCache?.get(c);
      if (!com) {
        com = this.community(c);
        comCache?.set(c, com);
      }
      const cnp = w.canopy[c];
      const t1 = tempResponse(g, w.temp[c]);
      const p1 = phResponse(g, w.ph[c]);
      const m1 = w.isWater[c] ? 1 : moistResponse(g, w.moist[c]);
      const o1 = o2Factor(g, w.atm.o2, w.atm.co2);
      const fit = t1 * p1 * m1 * hf[w.cls[c]] * (d.fitOpen + (d.fitForest - d.fitOpen) * cnp) * tierBonusOf(g) * o1 * this.exposureFitness(c);
      let C = 0;
      let Fp = 0;
      let Fc = 0;
      let loss = 0;
      for (let j = 0; j < com.list.length; j++) {
        const o = com.list[j];
        if (o === self) continue;
        const P = com.pops[j];
        const a = pairAlpha(g, o.genome) * P;
        C += a;
        if (a > 0) rivals.set(o.id, (rivals.get(o.id) ?? 0) + a);
        if (d.effH > 0) Fp += pairEdible(g, o.genome) * P;
        if (d.effC > 0) {
          const acc = pairAccess(g, d, o.genome, o.derived);
          Fc += (acc[0] + (acc[1] - acc[0]) * cnp) * P;
        }
        let l = 0;
        if (com.qH[j] > 0) l += com.qH[j] * pairEdible(o.genome, g) * d.grazeLoss;
        if (com.qC[j] > 0) {
          const acc = pairAccess(o.genome, o.derived, g, d);
          l += com.qC[j] * (acc[0] + (acc[1] - acc[0]) * cnp);
        }
        if (l > 0) hunters.set(o.id, (hunters.get(o.id) ?? 0) + l);
        loss += l;
      }
      let K: number;
      if (g.diet === 'photo') K = KSCALE * w.photoProd[c];
      else if (g.diet === 'chemo') K = KSCALE * w.chemoProd[c];
      else K = d.kBonus * (d.effH * Fp + d.effC * Fc);
      const gr = K > 1e-3 ? d.rate * Math.max(-0.6, fit - MAINT - C / K) - loss : -0.6 * d.rate - loss;
      if (gr > best) {
        best = gr;
        out.bestCell = c;
      }
      n++;
      growth += gr;
      tF += t1;
      pF += p1;
      oF += o1;
      temp += w.temp[c];
      ph += w.ph[c];
      if (!w.isWater[c]) {
        mF += m1;
        moist += w.moist[c];
        land++;
      }
      food += K > 1e-3 ? Math.min(1, K / (KSCALE * 0.15)) : 0;
      crowd += K > 1e-3 ? Math.min(2, C / K) : 2;
      danger += loss;
    }
    growth /= n;
    tF /= n;
    pF /= n;
    oF /= n;
    temp /= n;
    ph /= n;
    food /= n;
    crowd /= n;
    danger /= n;
    if (land) {
      mF /= land;
      moist /= land;
    } else mF = 1;
    out.growth = growth;
    out.stars = growth > 0.06 ? 5 : growth > 0.035 ? 4 : growth > 0.015 ? 3 : growth > 0.003 ? 2 : growth > -0.01 ? 1 : 0;

    // the reasons, worst first
    const name = (m: Map<number, number>) => {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? this.species[top[0]].name : '';
    };
    const issues: [number, string][] = [];
    if (tF < 0.7) issues.push([1 - tF, temp > g.tempOpt ? `too hot (around ${Math.round(temp)} °C)` : `too cold (around ${Math.round(temp)} °C)`]);
    if (pF < 0.7) issues.push([1 - pF, ph < g.phOpt ? `too acidic (pH ${ph.toFixed(1)})` : `too alkaline (pH ${ph.toFixed(1)})`]);
    if (land && mF < 0.7) issues.push([1 - mF, moist < g.moistOpt ? 'too dry' : 'too wet']);
    if (oF < 0.8) issues.push([1 - oF, g.tier === 0 && g.diet === 'chemo' ? 'too much oxygen' : 'too little oxygen']);
    if (!d.auto && food < 0.25) issues.push([1 - food * 2, 'little to eat here']);
    if (danger > 0.02) issues.push([danger * 8, `dangerous: ${name(hunters)} ${d.auto ? 'grazes' : 'hunts'} here`]);
    if (crowd > 0.7) issues.push([crowd - 0.4, `crowded by rivals such as ${name(rivals)}`]);
    issues.sort((a, b) => b[0] - a[0]);
    out.notes = issues.slice(0, 3).map((x) => x[1]);
    if (!issues.length || growth > 0.02) {
      if (!d.auto && food > 0.6) out.notes.push('plenty to eat');
      if (danger < 0.003) out.notes.push('few enemies');
      if (tF > 0.85 && pF > 0.85 && mF > 0.85) out.notes.push('a climate that suits it');
    }
    return out;
  }

  /**
   * Bring a designed mutant into the world. Next to its parent, part of the parent population takes
   * on the change; elsewhere a band of founders is set down. A shelter keeps it safe for a while.
   */
  createMutant(parent: Species, genome: Genome, cell: number, shelterTicks: number): Species | null {
    if (!parent.alive || this.nAlive >= MAXS - 1) return null;
    const w = this.world;
    sanitize(genome);
    const major = genome.tier !== parent.genome.tier || genome.diet !== parent.genome.diet || genome.habitat !== parent.genome.habitat;
    const sp = this.addSpecies(genome, parent, major);
    if (!sp) return null;
    let near = 0;
    this.forRadius(cell, 3, (c) => (near += this.pop[c * MAXS + parent.slot]));
    if (near > 20) {
      this.forRadius(cell, 3, (c) => {
        const idx = c * MAXS + parent.slot;
        const moved = this.pop[idx] * 0.4;
        if (moved > 0 && this.hab[sp.slot * 4 + w.cls[c]] > 0.02) {
          this.pop[idx] -= moved;
          this.pop[c * MAXS + sp.slot] += moved;
        }
      });
    }
    if (near <= 20 || this.pop[cell * MAXS + sp.slot] < 1) {
      const founders = Math.max(40, Math.min(400, parent.totalPop * 0.03));
      this.forRadius(cell, 2, (c, dist) => {
        if (this.hab[sp.slot * 4 + w.cls[c]] > 0.02) this.pop[c * MAXS + sp.slot] += founders * (1 - dist / 3) * 0.3;
      });
    }
    sp.shelterUntil = this.tick + shelterTicks;
    sp.playerMade = true;
    this.addEffect('spark', cell, 3);
    return sp;
  }

  /** Put a founding population at a cell and its habitable neighbours. Returns cells settled. */
  plant(sp: Species, cell: number, amount: number): number {
    const w = this.world;
    const s = sp.slot;
    let n = 0;
    if (this.hab[s * 4 + w.cls[cell]] > 0.02) {
      this.pop[cell * MAXS + s] += amount;
      n++;
    }
    for (let k = 0; k < 4; k++) {
      const nc = w.nb[cell * 4 + k];
      if (nc >= 0 && this.hab[s * 4 + w.cls[nc]] > 0.02) {
        this.pop[nc * MAXS + s] += amount * 0.5;
        n++;
      }
    }
    return n;
  }

  randomOccupiedCell(sp: Species): number {
    const s = sp.slot;
    const start = this.rng.int(N);
    for (let i = 0; i < N; i++) {
      const c = (start + i * 7919) % N;
      if (this.pop[c * MAXS + s] > MINP * 5) return c;
    }
    return -1;
  }

  densestCell(sp: Species): number {
    const s = sp.slot;
    let best = -1;
    let bestP = 0;
    for (let c = 0; c < N; c++) {
      const p = this.pop[c * MAXS + s];
      if (p > bestP) {
        bestP = p;
        best = c;
      }
    }
    return best;
  }

  /** Living species in a cell, most abundant first. */
  speciesAt(c: number): { sp: Species; pop: number }[] {
    const out: { sp: Species; pop: number }[] = [];
    for (const sp of this.alive) {
      const p = this.pop[c * MAXS + sp.slot];
      if (p > 0) out.push({ sp, pop: p });
    }
    return out.sort((a, b) => b.pop - a.pop);
  }

  // -------------------------------------------------------------------------
  // Milestones and goals
  // -------------------------------------------------------------------------

  private onEstablished(sp: Species): void {
    if (sp.kind === 'animal') this.animalsEver++;
    this.checkTraits(sp);
  }

  /** Announce the firsts of evolution. Called when a species establishes itself or changes in place. */
  private checkTraits(sp: Species): void {
    const g = sp.genome;
    const auto = isAuto(g);
    const land = g.habitat !== 'aquatic';
    const first = (key: string, icon: string, text: string) => {
      if (this.milestones.has(key)) return;
      this.milestones.add(key);
      this.log(icon, text, { speciesId: sp.id, major: true });
      for (const [k, name] of MILESTONE_AGE) {
        if (this.milestones.has(k)) {
          this.age = name;
          break;
        }
      }
    };
    if (g.diet === 'photo') first('photo', '☀️', `${sp.name} learns to eat sunlight. Oxygen begins to seep into the air.`);
    if (g.tier >= 1) first('eukaryote', '🧫', `${sp.name} wraps its genes in a nucleus: the first complex cell.`);
    if (!auto && g.tier <= 1) first('grazer', '🍽️', `${sp.name} stops making its own food and starts eating its neighbours.`);
    if (g.tier >= 2) first('multicellular', '🪸', `Cells band together. ${sp.name} is the first multicellular organism.`);
    if (g.tier >= 2 && !auto) first('animal', '🪼', `${sp.name}, the first animal, drifts through the seas.`);
    if (g.tier >= 3 && !auto) first('complex', '🦐', `${sp.name} grows organs, limbs and eyes.`);
    if (g.tier >= 2 && !auto && g.diet === 'carn') first('predator', '🦷', `${sp.name} discovers that other animals are made of food.`);
    if (auto && land) first('landPlant', '🌱', `${sp.name} creeps out of the water. The barren continents begin to turn green.`);
    if (!auto && land) first('landAnimal', '🦎', `${sp.name} follows the plants ashore.`);
    if (auto && land && sp.derived.tall > 0.5) first('tree', '🌳', `${sp.name} towers above the undergrowth. The first forests rise.`);
    if (g.tier >= 4 && !auto) first('advanced', '🦴', `${sp.name} grows a backbone and a proper brain.`);
    if (g.flight > 0.5) first('flight', '🪽', `${sp.name} takes to the air.`);
    if (g.fur > 0.5 && g.tier >= 4) first('fur', '🧥', `${sp.name} wraps itself in insulation and shrugs off the cold.`);
    if (g.horns > 0.6) first('horns', '🦌', `${sp.name} carries a magnificent set of horns across the open plains.`);
    if (g.intel > 0.5) first('clever', '🧠', `${sp.name} shows flashes of cunning: it plans, remembers and learns.`);
    if (g.intel >= SENTIENCE) {
      sp.sentient = true;
      first('sentient', '✨', `${sp.name} looks at its reflection in the water and understands. It is aware.`);
    }
  }

  private checkClimateNews(): void {
    if (this.tick % 4 !== 0) return;
    const w = this.world;
    if (!this.iceAge && w.iceFrac > 0.34) {
      this.iceAge = true;
      this.log('❄️', 'An ice age grips the world. Glaciers creep towards the equator.', { major: true });
    } else if (this.iceAge && w.iceFrac < 0.24) {
      this.iceAge = false;
      this.log('🌤️', 'The ice retreats and the world thaws.');
    }
    if (!this.hothouse && w.meanTemp > 31) {
      this.hothouse = true;
      this.log('🥵', 'A hothouse climate: the tropics are becoming unbearable.', { major: true });
    } else if (this.hothouse && w.meanTemp < 28) {
      this.hothouse = false;
      this.log('🌤️', 'The fever breaks and the climate cools.');
    }
  }

  goalProgress(): { value: number; label: string } {
    switch (this.goal) {
      case 'awakening': {
        let best = 0;
        for (const sp of this.alive) if (sp.genome.intel > best) best = sp.genome.intel;
        return { value: Math.min(1, best / SENTIENCE), label: `Brightest mind: ${Math.round((best / SENTIENCE) * 100)}% of awareness` };
      }
      case 'dominion': {
        let animals = 0;
        for (const sp of this.alive) if (sp.kind === 'animal') animals++;
        if (this.animalsEver < this.diff.dominionAnimals) return { value: 0, label: `Animals so far: ${this.animalsEver} of ${this.diff.dominionAnimals} needed before the cull` };
        return { value: animals <= 1 ? 1 : 1 / animals, label: `${animals} animal species remain` };
      }
      case 'eden':
      {
        const n = this.alive.filter((sp) => sp.established && sp.kind !== 'microbe').length;
        return { value: Math.min(1, n / this.diff.edenTarget), label: `${n} of ${this.diff.edenTarget} plants and animals` };
      }
      default:
        return { value: 0, label: 'No goal: do as you please' };
    }
  }

  private checkGoal(): void {
    if (this.status !== 'running') return;
    const yr = fmtYear(this.year);
    if (this.nAlive === 0) {
      this.end('lost', 'A Dead World', `In ${yr} the last living thing died. The planet is silent, and so are you.`);
      return;
    }
    if (this.goal === 'awakening') {
      const s = this.alive.find((sp) => sp.sentient);
      if (s) {
        this.end('won', 'The Awakening', `In ${yr}, ${s.name} looked up at the night sky and wondered who made it. You have company at last.`);
        return;
      }
    } else if (this.goal === 'dominion') {
      const animals = this.alive.filter((sp) => sp.kind === 'animal');
      if (this.animalsEver >= this.diff.dominionAnimals && animals.length === 1 && animals[0].established) {
        this.end('won', 'Dominion', `In ${yr}, ${animals[0].name} is the only animal left on the planet. Every rival has been eaten, starved or crowded out.`);
        return;
      }
    } else if (this.goal === 'eden') {
      const n = this.alive.filter((sp) => sp.established && sp.kind !== 'microbe').length;
      if (n >= this.diff.edenTarget) {
        this.end('won', 'Garden of Eden', `In ${yr}, ${n} kinds of plants and animals share your world: a living tapestry from pole to pole.`);
        return;
      }
    }
    if (this.tick === TOTAL_TICKS) {
      if (this.sandbox) this.log('⌛', 'Four billion years have passed. Time rolls on.', { major: true });
      else this.end('lost', 'Time Has Run Out', 'Four billion years have passed and your design remains unfinished. The world goes on without a purpose.');
    }
  }

  private end(status: 'won' | 'lost', title: string, text: string): void {
    this.status = status;
    this.endTitle = title;
    this.endText = text;
    this.log(status === 'won' ? '🏆' : '⚰️', text, { major: true });
  }

  // -------------------------------------------------------------------------
  // Fire, plague and other disasters
  // -------------------------------------------------------------------------

  /** How readily the air lets things burn; nothing catches below roughly 8 % oxygen. */
  fireOxygen(): number {
    return clamp((this.world.atm.o2 - 8) / 13, 0, 1.6);
  }

  fuelAt(c: number): number {
    return Math.min(1, this.world.canopy[c] + this.world.cover[c] * 0.8);
  }

  ignite(c: number): boolean {
    const w = this.world;
    if (w.isWater[c] || w.burning[c] || this.fuelAt(c) < 0.08 || this.fireOxygen() <= 0) return false;
    w.burning[c] = 2;
    w.fireCooldown[c] = 0;
    this.fires.push(c);
    return true;
  }

  private updateFires(): void {
    const w = this.world;
    const { fireCooldown, char, burning, nb } = w;
    for (let c = 0; c < N; c++) {
      if (fireCooldown[c] > 0) fireCooldown[c]--;
      if (char[c] > 0) char[c] = char[c] > 0.02 ? char[c] * 0.95 : 0;
    }
    if (!this.fires.length) return;
    const o2k = this.fireOxygen();
    const next: number[] = [];
    for (const c of this.fires) {
      this.burnCell(c);
      for (let k = 0; k < 4; k++) {
        const nc = nb[c * 4 + k];
        if (nc < 0 || w.isWater[nc] || burning[nc] || fireCooldown[nc]) continue;
        const dry = clamp(1.25 - w.moist[nc] * 1.1, 0.08, 1);
        if (this.rng.chance(0.6 * this.fuelAt(nc) * dry * o2k)) {
          burning[nc] = 2;
          next.push(nc);
        }
      }
      if (--burning[c] > 0) next.push(c);
      else fireCooldown[c] = 14;
    }
    this.fires = next;
  }

  private burnCell(c: number): void {
    const w = this.world;
    const base = c * MAXS;
    for (const sp of this.alive) {
      const p = this.pop[base + sp.slot];
      if (p <= 0) continue;
      const g = sp.genome;
      this.pop[base + sp.slot] = p * (1 - sp.derived.fireLoss);
      sp.losses.fire += p * sp.derived.fireLoss;
      sp.lastHit = 'fire';
      sp.lastHitTick = this.tick;
    }
    w.canopy[c] *= 0.4;
    w.cover[c] *= 0.5;
    w.char[c] = 1;
    // burning returns a little carbon to the air and uses up a little oxygen
    w.atm.co2 += 0.01;
    w.atm.o2 = Math.max(0, w.atm.o2 - 0.0004);
  }

  /** Visit every cell within a radius (wrapping east-west). */
  forRadius(cell: number, radius: number, cb: (c: number, dist: number) => void): void {
    const cx = cell % W;
    const cy = Math.floor(cell / W);
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        cb(y * W + ((cx + dx + W) % W), dist);
      }
    }
  }

  private killAt(c: number, frac: number, cause: string): void {
    if (frac <= 0) return;
    const base = c * MAXS;
    for (const sp of this.alive) {
      const p = this.pop[base + sp.slot];
      if (p <= 0) continue;
      this.pop[base + sp.slot] = p * (1 - frac);
      sp.losses.disaster += p * frac;
      sp.lastHit = cause;
      sp.lastHitTick = this.tick;
    }
  }

  addEffect(type: VisualEffect['type'], cell: number, radius: number): void {
    this.effects.push({ id: this.nextEffect++, type, cell, radius });
    if (this.effects.length > 40) this.effects.shift();
  }

  meteor(cell: number, natural: boolean): void {
    const w = this.world;
    const R = 7;
    this.forRadius(cell, R, (c, dist) => {
      this.killAt(c, dist < R / 2 ? 1 : 0.9 * (1 - (dist - R / 2) / (R / 2)), 'impact');
      w.canopy[c] *= 0.2;
      w.cover[c] *= 0.2;
      if (!w.isWater[c]) w.char[c] = 1;
      w.mineralMod[c] = Math.min(1, w.mineralMod[c] + 0.3 * (1 - dist / R));
    });
    this.forRadius(cell, R + 2, (c, dist) => {
      if (dist > R - 1 && this.rng.chance(0.5)) this.ignite(c);
    });
    w.atm.dust += 45;
    w.atm.so2 = Math.min(100, w.atm.so2 + 10);
    w.atm.co2 += 40;
    this.climateDirty = true;
    this.addEffect('meteor', cell, R);
    const where = w.isWater[cell] ? 'the ocean' : w.continentName(cell);
    this.log('☄️', natural ? `A wandering asteroid slams into ${where}. Dust blots out the sun.` : `You hurl a mountain from the sky into ${where}. Dust blots out the sun.`, { cell, major: true });
  }

  volcano(cell: number, natural: boolean): void {
    const w = this.world;
    this.forRadius(cell, 3, (c, dist) => {
      this.killAt(c, 0.9 * (1 - dist / 3.5), 'eruption');
      if (!w.isWater[c]) w.char[c] = Math.max(w.char[c], 1 - dist / 4);
    });
    this.forRadius(cell, 5, (c, dist) => {
      w.mineralMod[c] = Math.min(1, w.mineralMod[c] + 0.5 * (1 - dist / 6));
    });
    this.forRadius(cell, 4, (c) => {
      if (this.rng.chance(0.3)) this.ignite(c);
    });
    w.atm.so2 = Math.min(100, w.atm.so2 + 20);
    w.atm.co2 += 50;
    this.climateDirty = true;
    this.addEffect('volcano', cell, 4);
    this.volcanoes.push({ cell, tick: this.tick });
    if (this.volcanoes.length > 40) this.volcanoes.shift();
    const where = w.isWater[cell] ? 'beneath the sea' : `in ${w.continentName(cell)}`;
    if (!natural) this.log('🌋', `At your command the earth splits open ${where}.`, { cell });
    else if (!w.isWater[cell]) this.log('🌋', `A volcano erupts ${where}, spreading ash and fertile minerals.`, { cell });
  }

  startPlague(sp: Species, cell: number, natural: boolean, kind: Plague['kind'] = this.rng.pick(['acute', 'acute', 'genotoxic', 'retroviral'])): Plague | null {
    if (!sp.alive) return null;
    if (this.plagues.some((p) => p.speciesId === sp.id)) return null;
    const state = new Uint8Array(N);
    const active: number[] = [];
    this.forRadius(cell, 2, (c) => {
      if (this.pop[c * MAXS + sp.slot] > MINP) {
        state[c] = 1;
        active.push(c);
      }
    });
    if (!active.length) return null;
    const pl: Plague = {
      kind,
      id: this.nextPlague++,
      speciesId: sp.id,
      name: `the ${this.rng.pick(PLAGUE_A)} ${this.rng.pick(PLAGUE_B)}`,
      state,
      active,
      mortality: kind === 'acute' ? 0.42 : kind === 'genotoxic' ? 0.26 : 0.16,
      spread: clamp(0.45 + 0.3 * sp.genome.social + (sp.genome.tier <= 1 ? 0.15 : 0), 0, 0.9),
      duration: kind === 'retroviral' ? 7 : 4,
      startPop: sp.totalPop,
      killed: 0,
      natural,
    };
    this.plagues.push(pl);
    this.addEffect('plague', cell, 2);
    this.log('🦠', natural ? `A sickness, ${pl.name}, breaks out among ${sp.name}.` : `You breathe ${pl.name} upon ${sp.name}.`, { speciesId: sp.id, cell });
    this.log('🔬', kind === 'retroviral' ? 'This retrovirus can occasionally leave inherited insertions; most create no successful lineage.' : kind === 'genotoxic' ? 'This infection damages host cells. Somatic damage is not passed to offspring.' : 'This acute infection favours existing resistance among exposed populations.', { speciesId: sp.id, cell });
    return pl;
  }

  private updatePlagues(): void {
    const nb = this.world.nb;
    for (const pl of this.plagues.slice()) {
      const sp = this.species[pl.speciesId];
      if (sp.alive && sp.shelterUntil > this.tick) continue;
      if (!sp.alive) continue;
      const slot = sp.slot;
      const regional = new Float64Array(DEMES);
      const killedLow = new Float64Array(DEMES), killedHigh = new Float64Array(DEMES);
      for (let c = 0; c < N; c++) regional[demeAt(c)] += this.pop[c * MAXS + slot];
      const next: number[] = [];
      for (const c of pl.active) {
        const before = this.pop[c * MAXS + slot];
        const d = demeAt(c), i = d * MAXS + slot, f = this.resistance[i];
        const somatic = pl.kind === 'genotoxic' ? 0.035 : 0;
        const low = clamp(pl.mortality * (1 - 0.85 * clamp(sp.genome.immunity - 0.1, 0, 1)) + somatic, 0, 1);
        const high = clamp(pl.mortality * (1 - 0.85 * clamp(sp.genome.immunity + 0.1, 0, 1)) + somatic, 0, 1);
        const mort = low * (1 - f) + high * f;
        killedLow[d] += before * (1 - f) * low;
        killedHigh[d] += before * f * high;
        pl.killed += before * mort;
        sp.losses.plague += before * mort;
        this.pop[c * MAXS + slot] = before * (1 - mort);
        const st = ++pl.state[c];
        if (st <= pl.duration) next.push(c);
        else pl.state[c] = 255;
        if (st <= 2) {
          for (let k = 0; k < 4; k++) {
            const nc = nb[c * 4 + k];
            if (nc >= 0 && pl.state[nc] === 0 && this.pop[nc * MAXS + slot] > MINP * 2 && this.rng.chance(pl.spread)) {
              pl.state[nc] = 1;
              next.push(nc);
            }
          }
        }
      }
      for (let d = 0; d < DEMES; d++) {
        const i = d * MAXS + slot, f = this.resistance[i];
        const survivors = regional[d] - killedLow[d] - killedHigh[d];
        if (survivors > MINP) this.resistance[i] = clamp((regional[d] * f - killedHigh[d]) / survivors, 0, 1);
      }
      if (pl.kind === 'retroviral' && pl.active.length && this.rng.chance(0.01)) {
        // Inherited insertion is a rare additional random variant, subject to normal establishment.
        const c = this.rng.pick(pl.active);
        const child = this.trySpeciate(sp, { atCell: c, crowd: Math.max(0, 1 - this.nAlive / SOFT_CAP) });
        if (child) this.log('🧬', `An inherited viral insertion contributed to a new branch of ${sp.name}.`, { speciesId: child.id, cell: c });
      }
      // now and then a carrier travels far
      if (next.length && this.rng.chance(0.35)) {
        const from = next[this.rng.int(next.length)];
        const y = Math.floor(from / W) + this.rng.int(11) - 5;
        const x = ((from % W) + this.rng.int(11) - 5 + W) % W;
        if (y >= 0 && y < H) {
          const t = y * W + x;
          if (pl.state[t] === 0 && this.pop[t * MAXS + slot] > MINP * 2) {
            pl.state[t] = 1;
            next.push(t);
          }
        }
      }
      pl.active = next;
      sp.lastHit = 'plague';
      sp.lastHitTick = this.tick;
      if (!next.length) {
        this.plagues.splice(this.plagues.indexOf(pl), 1);
        const dead = pl.startPop > 0 ? clamp(pl.killed / pl.startPop, 0, 0.99) : 0;
        if (!pl.natural || dead > 0.2) this.log('🩹', `${cap(pl.name)} burns itself out. Recorded losses equal about ${Math.round(dead * 100)}% of the starting population. Selection affected exposed populations; distant populations received no immunity.`, { speciesId: sp.id });
      }
    }
  }

  private naturalEvents(): void {
    const w = this.world;
    const dis = this.diff.disasters;
    if (this.rng.chance(0.06 * dis * this.fireOxygen())) {
      for (let i = 0; i < 4; i++) {
        const c = this.rng.int(N);
        if (!w.isWater[c] && this.fuelAt(c) > 0.4 && w.moist[c] < 0.55 && this.ignite(c)) break;
      }
    }
    if (this.rng.chance(0.002 * dis)) {
      for (let tries = 0; tries < 30; tries++) {
        const c = this.rng.int(N);
        if (this.rng.chance(w.tectonics.activity[c])) { this.volcano(c, true); break; }
      }
    }
    if (this.rng.chance(0.0003 * dis)) this.meteor(this.rng.int(N), true);
    if (this.rng.chance(0.004 * dis) && this.alive.length) {
      const sp = this.rng.pick(this.alive);
      if (sp.cells > 80 && sp.established && sp.kind !== 'microbe' && this.rng.chance(0.3 + sp.genome.social)) {
        const c = this.randomOccupiedCell(sp);
        if (c >= 0) this.startPlague(sp, c, true);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Divine interface
  // -------------------------------------------------------------------------

  /** What a divine act with this base price costs at the chosen difficulty. */
  price(base: number): number {
    return Math.round(base * this.diff.cost);
  }

  canAfford(base: number): boolean {
    return this.sandbox || this.energy >= this.price(base);
  }

  spend(base: number): boolean {
    if (this.sandbox) return true;
    const cost = this.price(base);
    if (this.energy < cost) return false;
    this.energy -= cost;
    return true;
  }

  /** Position of an atmosphere value on its slider, 0..1. */
  static atmNorm(key: AtmKey, v: number): number {
    const r = ATM_RANGE[key];
    if (r.log) return Math.log(v / r.min) / Math.log(r.max / r.min);
    return (v - r.min) / (r.max - r.min);
  }

  static atmFromNorm(key: AtmKey, n: number): number {
    const r = ATM_RANGE[key];
    if (r.log) return r.min * Math.pow(r.max / r.min, n);
    return r.min + (r.max - r.min) * n;
  }

  atmCost(key: AtmKey, value: number): number {
    return 50 * this.diff.cost * Math.abs(Sim.atmNorm(key, value) - Sim.atmNorm(key, this.world.atm[key]));
  }

  /** God sets a property of the air, the sun or the sea. Costs energy in proportion to the change. */
  setAtmosphere(key: AtmKey, value: number): { ok: boolean; value: number } {
    const a = this.world.atm;
    const r = ATM_RANGE[key];
    value = clamp(value, r.min, r.max);
    let cost = this.atmCost(key, value);
    if (cost < 0.01) return { ok: true, value: a[key] };
    if (!this.sandbox && cost > this.energy) {
      // go as far as the remaining energy allows
      const n0 = Sim.atmNorm(key, a[key]);
      const n1 = Sim.atmNorm(key, value);
      const frac = this.energy / cost;
      if (frac < 0.02) return { ok: false, value: a[key] };
      value = Sim.atmFromNorm(key, n0 + (n1 - n0) * frac);
      cost = this.energy;
    }
    if (!this.sandbox) this.energy = Math.max(0, this.energy - cost);
    a[key] = value;
    if (key === 'seaLevel') { this.world.updateGeography(); this.refreshRegions(); }
    this.climateDirty = true;
    const text: Record<AtmKey, string> = {
      co2: `You set the carbon dioxide to ${Math.round(value)} ppm.`,
      o2: `You set the oxygen to ${value.toFixed(1)}%.`,
      ch4: `You set the methane to ${Math.round(value)} ppm.`,
      so2: `You fill the sky with sulfur haze (${Math.round(value)}).`,
      sun: `You ${value >= 0 ? 'brighten' : 'dim'} the sun (${value >= 0 ? '+' : ''}${value.toFixed(1)} °C).`,
      seaLevel: `You ${value >= 0 ? 'raise' : 'lower'} the seas by ${Math.abs(Math.round(value * 1000))} m.`,
    };
    this.log('🌡️', text[key]);
    return { ok: true, value };
  }

  log(icon: string, text: string, opts: { speciesId?: number; cell?: number; major?: boolean } = {}): void {
    this.events.push({ tick: this.tick, year: this.year, icon, text, ...opts });
  }
}

/** Smallest total biomass at which a species can still sustain itself. */
function viablePop(sp: Species): number {
  return sp.derived.auto ? 150 : sp.genome.diet === 'carn' ? 12 : 40;
}

/**
 * Plants advance on separate fronts: trees reaching a new level of complexity says nothing about
 * whether the low ground cover has (that is how flowering grasses get their chance). Animals share one front.
 */
function sameGrowthForm(a: Species, b: Species): boolean {
  if (!a.derived.auto) return true;
  return (a.genome.habitat === 'aquatic') === (b.genome.habitat === 'aquatic') && (a.derived.tall > 0.3) === (b.derived.tall > 0.3);
}

/** Species that compete for the same living. Trees and the grass beneath them are different trades. */
function guildKey(g: Genome): string {
  const form = isAuto(g) ? (g.size > 4.95 ? '|tall' : '|low') : '';
  const zone = g.tempOpt < 4 ? '|cold' : g.tempOpt < 18 ? '|mild' : '|warm';
  return `${g.tier}|${g.diet}|${g.habitat}${form}${zone}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtYear(year: number): string {
  return year >= 1e9 ? `${(year / 1e9).toFixed(2)} billion years` : year >= 1e6 ? `${(year / 1e6).toFixed(1)} million years` : `year ${Math.round(year).toLocaleString('en-US')}`;
}

export function fmtYears(years: number): string {
  if (years >= 1e9) return `${(years / 1e9).toFixed(2)} billion years`;
  if (years >= 1e6) return `${(years / 1e6).toFixed(1)} million years`;
  if (years >= 10000) return `${Math.round(years / 1000).toLocaleString('en-US')},000 years`;
  return `${(Math.round(years / 100) * 100).toLocaleString('en-US')} years`;
}
