import { fbm, makeNoise3, type Noise3 } from './noise';
import { RNG } from './rng';

export const W = 160;
export const H = 90;
export const N = W * H;

/** Cell classes: what kind of ground (or water) a cell offers to life. */
export const CLS_DEEP = 0;
export const CLS_SHALLOW = 1;
export const CLS_WET = 2; // coastal or rain-soaked land
export const CLS_DRY = 3; // inland land

/** Lookup-table resolutions for temperature, pH and moisture responses. */
export const T_LUT = 200; // -40 .. 59.5 °C in 0.5° steps
export const P_LUT = 141; // pH 0 .. 14 in 0.1 steps
export const M_LUT = 102; // moisture 0 .. 100 %, index 101 = water
export const M_WATER = 101;

/** Elevation band below sea level that counts as continental shelf. */
export const SHELF = 0.14;

export interface Atmosphere {
  co2: number; // ppm
  o2: number; // %
  ch4: number; // ppm
  so2: number; // aerosol index 0..100
  dust: number; // impact / ash veil, decays quickly
  sun: number; // divine temperature offset, °C
  seaLevel: number; // elevation units
}

export interface Continent {
  id: number;
  name: string;
  size: number;
  cx: number;
  cy: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const NAME_A = ['Aur', 'Bor', 'Cal', 'Dor', 'Eld', 'Fal', 'Gon', 'Hes', 'Ith', 'Jor', 'Kel', 'Lem', 'Mer', 'Nor', 'Oph', 'Pan', 'Quel', 'Rhun', 'Sar', 'Thal', 'Ur', 'Val', 'Wes', 'Xer', 'Yl', 'Zan'];
const NAME_B = ['ia', 'or', 'and', 'ica', 'ea', 'oria', 'aris', 'una', 'eth', 'os', 'ara', 'ium'];

export class World {
  readonly seed: number;
  private nElev: Noise3;
  private nRidge: Noise3;
  private nameRng: RNG;
  private thr = 0;
  private posMax = 1;
  private negMax = 1;

  /** Neighbour table: for each cell, [west, east, north, south]; -1 beyond the poles. */
  readonly nb = new Int32Array(N * 4);

  // static geography
  readonly elev = new Float32Array(N);
  readonly absLat = new Float32Array(N);
  readonly light = new Float32Array(N);
  readonly baseMoist = new Float32Array(N);
  readonly baseMinerals = new Float32Array(N);
  readonly basePh = new Float32Array(N);
  readonly vent = new Float32Array(N);
  readonly tempNoise = new Float32Array(N);

  // divine / event modifications, slowly fading
  readonly moistMod = new Float32Array(N);
  readonly mineralMod = new Float32Array(N);
  readonly phMod = new Float32Array(N);

  // derived climate
  readonly temp = new Float32Array(N);
  readonly moist = new Float32Array(N);
  readonly ph = new Float32Array(N);
  readonly minerals = new Float32Array(N);
  readonly isWater = new Uint8Array(N);
  readonly cls = new Uint8Array(N);
  readonly distCoast = new Uint8Array(N);
  readonly continent = new Int16Array(N);
  continents: Continent[] = [];
  readonly photoProd = new Float32Array(N);
  readonly chemoProd = new Float32Array(N);
  readonly ti = new Uint8Array(N);
  readonly pi = new Uint8Array(N);
  readonly mi = new Uint8Array(N);

  // vegetation structure, written by the simulation
  readonly canopy = new Float32Array(N);
  readonly cover = new Float32Array(N);
  readonly plankton = new Float32Array(N);

  // disturbance
  readonly burning = new Uint8Array(N);
  readonly fireCooldown = new Uint8Array(N);
  readonly char = new Float32Array(N);

  atm: Atmosphere = { co2: 1200, o2: 0.2, ch4: 30, so2: 0, dust: 0, sun: 0, seaLevel: 0 };
  meanTemp = 0;
  landFrac = 0;
  iceFrac = 0;
  forcing = 0;
  geoVersion = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.nElev = makeNoise3(seed * 7 + 1);
    this.nRidge = makeNoise3(seed * 7 + 2);
    this.nameRng = new RNG(seed * 7 + 9);
    const nMoist = makeNoise3(seed * 7 + 3);
    const nMin = makeNoise3(seed * 7 + 4);
    const nPh = makeNoise3(seed * 7 + 5);
    const nTemp = makeNoise3(seed * 7 + 6);
    const nVent = makeNoise3(seed * 7 + 7);

    // raw elevation, then pick the sea level that leaves about a third of the map dry
    const raw = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        raw[y * W + x] = this.rawAt((x + 0.5) / W, (y + 0.5) / H);
      }
    }
    const sorted = Float32Array.from(raw).sort();
    this.thr = sorted[Math.floor(N * 0.67)];
    this.posMax = Math.max(1e-6, sorted[N - 1] - this.thr);
    this.negMax = Math.max(1e-6, this.thr - sorted[0]);

    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const lat = Math.abs(v * 2 - 1);
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        const u = (x + 0.5) / W;
        const ang = u * Math.PI * 2;
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        const z = v * 3.5;
        this.elev[c] = this.elevAt(u, v);
        this.absLat[c] = lat;
        this.light[c] = 1 - 0.45 * lat * lat;
        this.baseMoist[c] = fbm(nMoist, cx * 1.6, cy * 1.6, z * 1.6, 4);
        this.baseMinerals[c] = clamp(0.5 + 1.1 * fbm(nMin, cx * 2.2, cy * 2.2, z * 2.2, 4), 0, 1);
        this.basePh[c] = 6.5 + 2.2 * fbm(nPh, cx * 1.9, cy * 1.9, z * 1.9, 3);
        this.tempNoise[c] = fbm(nTemp, cx * 2.4, cy * 2.4, z * 2.4, 3);
        const ridge = 1 - Math.abs(fbm(nVent, cx * 1.7, cy * 1.7, z * 1.7, 3));
        this.vent[c] = smoothstep(0.86, 0.98, ridge);

        this.nb[c * 4] = y * W + ((x + W - 1) % W);
        this.nb[c * 4 + 1] = y * W + ((x + 1) % W);
        this.nb[c * 4 + 2] = y > 0 ? c - W : -1;
        this.nb[c * 4 + 3] = y < H - 1 ? c + W : -1;
      }
    }
    this.updateGeography();
    this.updateClimate();
  }

  private rawAt(u: number, v: number): number {
    const ang = u * Math.PI * 2;
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    const z = v * 3.5;
    let e = fbm(this.nElev, cx * 0.95, cy * 0.95, z * 0.95, 6, 2.05, 0.5);
    const ridge = 1 - Math.abs(fbm(this.nRidge, cx * 2.1, cy * 2.1, z * 2.1, 3));
    e += 0.16 * (ridge - 0.75);
    const lat = Math.abs(v * 2 - 1);
    e -= 0.5 * smoothstep(0.8, 1, lat);
    return e;
  }

  /** Continuous elevation in [-1, 1] at map coordinates u,v in [0,1]; 0 is the original sea level. */
  elevAt(u: number, v: number): number {
    const raw = this.rawAt(u, v);
    return raw > this.thr
      ? Math.min(1.05, Math.pow((raw - this.thr) / this.posMax, 1.2))
      : -Math.min(1.05, Math.pow((this.thr - raw) / this.negMax, 0.85));
  }

  /** Recompute coastlines, distance to the sea and continents. Needed whenever sea level moves. */
  updateGeography(): void {
    const sea = this.atm.seaLevel;
    const { elev, isWater, distCoast, continent, nb } = this;
    let land = 0;
    for (let c = 0; c < N; c++) {
      isWater[c] = elev[c] < sea ? 1 : 0;
      if (!isWater[c]) land++;
    }
    this.landFrac = land / N;

    // breadth-first distance from the sea, capped
    const queue = new Int32Array(N);
    let qh = 0;
    let qt = 0;
    for (let c = 0; c < N; c++) {
      if (isWater[c]) {
        distCoast[c] = 0;
        queue[qt++] = c;
      } else distCoast[c] = 255;
    }
    while (qh < qt) {
      const c = queue[qh++];
      const d = distCoast[c];
      if (d >= 30) continue;
      for (let k = 0; k < 4; k++) {
        const n = nb[c * 4 + k];
        if (n >= 0 && distCoast[n] === 255) {
          distCoast[n] = d + 1;
          queue[qt++] = n;
        }
      }
    }

    // flood-fill continents
    const prev = this.continents;
    const prevLabel = Int16Array.from(continent);
    continent.fill(-1);
    const found: { cells: number; sx: number; sy: number; cxs: number; first: number }[] = [];
    for (let start = 0; start < N; start++) {
      if (isWater[start] || continent[start] !== -1) continue;
      const id = found.length;
      let cells = 0;
      let sxc = 0;
      let sxs = 0;
      let sy = 0;
      qh = 0;
      qt = 0;
      queue[qt++] = start;
      continent[start] = id;
      while (qh < qt) {
        const c = queue[qh++];
        cells++;
        const ang = ((c % W) / W) * Math.PI * 2;
        sxc += Math.cos(ang);
        sxs += Math.sin(ang);
        sy += Math.floor(c / W);
        for (let k = 0; k < 4; k++) {
          const n = nb[c * 4 + k];
          if (n >= 0 && !isWater[n] && continent[n] === -1) {
            continent[n] = id;
            queue[qt++] = n;
          }
        }
      }
      found.push({ cells, sx: sxc, sy, cxs: sxs, first: start });
    }

    // keep names stable: a new landmass inherits the name of the old one it overlaps most
    const usedNames = new Set<string>();
    const order = found.map((_, i) => i).sort((a, b) => found[b].cells - found[a].cells);
    const names: string[] = new Array(found.length).fill('');
    for (const i of order) {
      if (found[i].cells < 10) continue;
      let best = '';
      if (prev.length) {
        const votes = new Map<number, number>();
        for (let c = 0; c < N; c++) {
          if (continent[c] === i && prevLabel[c] >= 0) votes.set(prevLabel[c], (votes.get(prevLabel[c]) ?? 0) + 1);
        }
        let bestVotes = 0;
        for (const [pid, n] of votes) {
          const nm = prev[pid]?.name;
          if (nm && !usedNames.has(nm) && n > bestVotes) {
            bestVotes = n;
            best = nm;
          }
        }
      }
      if (!best) {
        do {
          best = this.nameRng.pick(NAME_A) + this.nameRng.pick(NAME_B);
        } while (usedNames.has(best));
      }
      usedNames.add(best);
      names[i] = best;
    }
    this.continents = found.map((f, i) => {
      let ang = Math.atan2(f.cxs, f.sx);
      if (ang < 0) ang += Math.PI * 2;
      return { id: i, name: names[i], size: f.cells, cx: (ang / (Math.PI * 2)) * W, cy: f.sy / f.cells };
    });
    this.geoVersion++;
  }

  /** Recompute temperature, rainfall, pH and productivity from the atmosphere. */
  updateClimate(): void {
    const a = this.atm;
    const co2 = Math.max(20, a.co2);
    const greenhouse = 3.0 * Math.log2(co2 / 280) + 1.0 * Math.log2(1 + a.ch4 / 10);
    const aerosol = -(a.so2 + a.dust) * 0.06;
    const off = a.sun + greenhouse + aerosol;
    this.forcing = off;
    const co2f = (1.4 * a.co2) / (a.co2 + 150);
    const acidRain = a.so2 * 0.02;
    const oceanPh = 8.2 - 0.35 * Math.log2(co2 / 280) - a.so2 * 0.006;
    const sea = a.seaLevel;
    const { elev, absLat, light, isWater, temp, moist, ph, minerals, cls, photoProd, chemoProd, ti, pi, mi } = this;
    const { baseMoist, baseMinerals, basePh, vent, tempNoise, moistMod, mineralMod, phMod, distCoast } = this;

    let sumT = 0;
    let ice = 0;
    for (let c = 0; c < N; c++) {
      // the fading of divine touch-ups
      moistMod[c] *= 0.996;
      mineralMod[c] *= 0.998;
      phMod[c] *= 0.996;

      const al = absLat[c];
      const amp = off * (0.8 + 0.5 * al); // poles feel climate change more
      const min = clamp(baseMinerals[c] + mineralMod[c], 0, 1);
      minerals[c] = min;
      let t: number;
      let p: number;
      if (isWater[c]) {
        t = 29 - 40 * Math.pow(al, 1.5) + amp * 0.9;
        if (t < -2) t = -2;
        const frozen = t <= -1.5;
        if (frozen) ice++;
        moist[c] = 1;
        p = oceanPh + phMod[c];
        const shallow = elev[c] > sea - SHELF;
        cls[c] = shallow ? CLS_SHALLOW : CLS_DEEP;
        const nutrients = shallow ? 0.5 + 0.5 * min : 0.1 + 0.3 * min;
        photoProd[c] = light[c] * nutrients * (frozen ? 0.12 : 1) * co2f;
        chemoProd[c] = shallow ? 0.02 + vent[c] * 0.3 + min * 0.04 : 0.02 + vent[c] * 0.65;
        mi[c] = M_WATER;
      } else {
        const h = elev[c] - sea;
        t = 29 - 44 * Math.pow(al, 1.5) - h * 30 + tempNoise[c] * 2.5 + amp;
        if (t < -8) ice++;
        let m = 0.5 + 0.3 * Math.cos(al * Math.PI * 3.2) + baseMoist[c] * 0.28;
        m += -0.012 * Math.min(distCoast[c], 14) + off * 0.006 + moistMod[c];
        m = clamp(m, 0, 1);
        moist[c] = m;
        p = basePh[c] + (0.5 - m) * 1.6 - acidRain + phMod[c];
        cls[c] = distCoast[c] <= 1 || m > 0.62 ? CLS_WET : CLS_DRY;
        photoProd[c] = light[c] * (0.3 + 0.7 * min) * co2f;
        chemoProd[c] = 0.01 + min * 0.02;
        mi[c] = Math.round(m * 100);
      }
      p = clamp(p, 0, 14);
      temp[c] = t;
      ph[c] = p;
      sumT += t;
      ti[c] = clamp(Math.round((t + 40) * 2), 0, T_LUT - 1);
      pi[c] = Math.round(p * 10);
    }
    this.meanTemp = sumT / N;
    this.iceFrac = ice / N;
  }

  continentName(c: number): string {
    const id = this.continent[c];
    if (id < 0) return '';
    return this.continents[id]?.name || 'a small island';
  }

  /** A short human name for the landscape of a cell. */
  biomeName(c: number): string {
    const t = this.temp[c];
    if (this.isWater[c]) {
      if (t <= -1.5) return 'Sea ice';
      if (this.vent[c] > 0.5 && this.cls[c] === CLS_DEEP) return 'Hydrothermal vents';
      if (this.cls[c] === CLS_SHALLOW) return this.canopy[c] > 0.4 ? 'Kelp forest' : t > 22 ? 'Tropical shallows' : 'Coastal shelf';
      return 'Open ocean';
    }
    const m = this.moist[c];
    const can = this.canopy[c];
    const cov = this.cover[c];
    const high = this.elev[c] - this.atm.seaLevel > 0.6;
    if (t < -8) return 'Ice sheet';
    if (this.char[c] > 0.5) return 'Burnt land';
    if (can > 0.55) {
      if (t > 20) return m > 0.68 ? 'Rainforest' : 'Tropical forest';
      if (t > 6) return 'Temperate forest';
      return 'Boreal forest';
    }
    if (can > 0.18) return t > 18 ? 'Savanna woodland' : 'Open woodland';
    if (cov > 0.15) {
      if (t < 0) return 'Tundra';
      if (m > 0.75) return 'Marsh';
      if (t > 18) return 'Savanna';
      return 'Grassland';
    }
    if (high) return 'Bare mountains';
    if (t < 0) return 'Polar barrens';
    if (m < 0.22) return 'Desert';
    return 'Barren rock';
  }
}
