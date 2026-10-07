/** Coarse geological processes. Units and intentional simplifications are in docs/science.md. */
import { RNG } from './rng';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap = (x: number, n: number) => ((x % n) + n) % n;

/** Exact mean of an orbital oscillation over an epoch; avoids aliasing millennia into eons. */
export function meanCycle(start: number, end: number, period: number): number {
  const k = 2 * Math.PI / period;
  return end > start ? (Math.cos(k * start) - Math.cos(k * end)) / (k * (end - start)) : Math.sin(k * start);
}

/**
 * Plates drift at this fraction of their real speed. A gameplay choice: at full speed the continents
 * would circle the map several times in one game, faster than life can be followed or helped along.
 */
export const DRIFT = 0.3;

export interface Plate { x: number; y: number; dx: number; dy: number; vx: number; vy: number; speed: number }

/** Rigid translating crust patches on a cylindrical map, not a mantle convection solver. */
export class Tectonics {
  readonly plates: Plate[] = [];
  readonly owner: Int16Array;
  readonly activity: Float32Array;
  readonly source: Int32Array;
  private readonly originalOwner: Int16Array;
  private readonly original: Float32Array;
  private readonly hotspots: number[] = [];
  constructor(readonly width: number, readonly height: number, elevation: Float32Array, seed: number) {
    const rng = new RNG(seed + 9137);
    this.original = elevation.slice();
    this.owner = new Int16Array(elevation.length);
    this.originalOwner = new Int16Array(elevation.length);
    this.activity = new Float32Array(elevation.length);
    this.source = new Int32Array(elevation.length);
    for (let i = 0; i < 12; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(1, 7); // cm/year
      this.plates.push({ x: rng.range(0, width), y: rng.range(0, height), dx: 0, dy: 0,
        vx: Math.cos(angle) * speed * 1e-5 * width / 40075,
        vy: Math.sin(angle) * speed * 1e-5 * height / 20004, speed });
    }
    for (let c = 0; c < elevation.length; c++) {
      let best = Infinity;
      for (let p = 0; p < this.plates.length; p++) {
        const plate = this.plates[p];
        const dx = Math.min(Math.abs(c % width - plate.x), width - Math.abs(c % width - plate.x));
        const dy = Math.floor(c / width) - plate.y;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; this.owner[c] = p; }
      }
      this.source[c] = c;
    }
    this.originalOwner.set(this.owner);
    for (let i = 0; i < 5; i++) this.hotspots.push(rng.int(elevation.length));
    this.boundaries();
  }

  advance(years: number, elevation: Float32Array): { dx: number; dy: number }[] {
    const shifts = this.plates.map(p => {
      const oldY = p.dy;
      // A planar projection cannot continue through a pole; reflect the patch there.
      const vx = p.vx * DRIFT, vy = p.vy * DRIFT;
      if (p.y + p.dy + vy * years < 0 || p.y + p.dy + vy * years >= this.height) p.vy *= -1;
      p.dx = wrap(p.dx + vx * years, this.width);
      p.dy += p.vy * DRIFT * years;
      return { dx: vx * years, dy: p.dy - oldY };
    });
    for (let c = 0; c < elevation.length; c++) {
      const x = c % this.width, y = Math.floor(c / this.width);
      let best = -0.65, owner = -1, source = -1, overlaps = 0;
      for (let i = 0; i < this.plates.length; i++) {
        const p = this.plates[i];
        const sx = wrap(x - p.dx, this.width), sy = y - p.dy;
        if (sy < 0 || sy > this.height - 1) continue;
        const src = Math.round(sy) * this.width + wrap(Math.round(sx), this.width);
        if (this.originalOwner[src] !== i) continue;
        const x0 = Math.floor(sx), y0 = Math.min(this.height - 2, Math.floor(sy)), fx = sx - x0, fy = sy - y0;
        const a = y0 * this.width + x0, b = y0 * this.width + wrap(x0 + 1, this.width);
        const value = (this.original[a] * (1 - fx) + this.original[b] * fx) * (1 - fy)
          + (this.original[a + this.width] * (1 - fx) + this.original[b + this.width] * fx) * fy;
        if (value > 0) overlaps++;
        if (owner < 0 || value > best) { best = value; owner = i; source = src; }
      }
      // Overlapping continental patches build relief; gaps represent newly formed ocean floor.
      elevation[c] = clamp(best + Math.max(0, overlaps - 1) * 0.12, -1.05, 1.05);
      this.owner[c] = owner;
      this.source[c] = source;
    }
    this.boundaries();
    return shifts;
  }

  private boundaries(): void {
    for (let c = 0; c < this.owner.length; c++) {
      const x = c % this.width, y = Math.floor(c / this.width), p = this.owner[c];
      let activity = p < 0 ? 0.3 : 0.01;
      for (const nc of [y * this.width + wrap(x + 1, this.width), y * this.width + wrap(x - 1, this.width), c - this.width, c + this.width]) {
        if (nc < 0 || nc >= this.owner.length || this.owner[nc] === p) continue;
        const q = this.owner[nc];
        if (p < 0 || q < 0) activity = Math.max(activity, 0.75);
        else {
          const a = this.plates[p], b = this.plates[q];
          activity = Math.max(activity, clamp(Math.hypot(a.vx - b.vx, a.vy - b.vy) * 3e6, 0.15, 1));
        }
      }
      for (const h of this.hotspots) {
        const dx = Math.min(Math.abs(x - h % this.width), this.width - Math.abs(x - h % this.width));
        activity = Math.max(activity, Math.exp(-(dx * dx + (y - Math.floor(h / this.width)) ** 2) / 5));
      }
      this.activity[c] = activity;
    }
  }
}

/** Stocks in abstract carbon units. All carbon transfers conserve the sum of the three stocks. */
export class CarbonCycle {
  organic = 0;
  rock = 8000;
  ocean = 1200;
  reducingSink = 8;
  step(atm: { co2: number; o2: number; ch4: number }, years: number, production: number, consumers: number, warmth: number): void {
    const dt = years / 1e6;
    const transfer = (stock: number, rate: number) => Math.min(Math.max(0, stock), Math.max(0, rate * dt));
    // Fast respiration returns most fixation; only a small net fraction enters buried organic carbon.
    const burial = transfer(atm.co2, 6 * production / (1 + 0.15 * consumers));
    const oxidation = transfer(this.organic, this.organic * 0.0015 * (0.1 + atm.o2 / 21));
    const weathering = transfer(atm.co2 - burial, 1.3 * Math.pow(atm.co2 / 1200, 0.4) * Math.exp(clamp(warmth, -20, 20) * 0.025));
    const degassing = transfer(this.rock, 1.3);
    const exchange = (atm.co2 - this.ocean) * (1 - Math.exp(-years / 30e6));
    atm.co2 += -burial + oxidation - weathering + degassing - exchange;
    this.ocean += exchange;
    this.organic += burial - oxidation;
    this.rock += weathering - degassing;
    const oxygen = burial * 0.035;
    const sink = Math.min(this.reducingSink, oxygen);
    this.reducingSink -= sink;
    atm.o2 = clamp(atm.o2 + oxygen - sink - oxidation * 0.035 - atm.o2 * 0.0002 * dt, 0, 35);
  }
}
