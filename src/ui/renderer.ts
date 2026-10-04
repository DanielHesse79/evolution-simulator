import { H, N, W } from '../sim/world';
import { MAXS, VOLCANO_LIFE, type Sim } from '../sim/simulation';
import type { Species } from '../sim/species';

export type Layer = 'terrain' | 'temp' | 'moist' | 'ph' | 'minerals' | 'flora' | 'fauna' | 'richness';

type RGB = [number, number, number];
type Stops = [number, RGB][];

const TEMP_STOPS: Stops = [
  [-30, [52, 28, 110]],
  [-10, [62, 96, 205]],
  [0, [116, 194, 232]],
  [10, [94, 188, 122]],
  [20, [232, 220, 92]],
  [30, [240, 142, 52]],
  [40, [204, 44, 44]],
  [50, [96, 4, 34]],
];
const MOIST_STOPS: Stops = [
  [0, [196, 154, 92]],
  [0.35, [150, 176, 96]],
  [0.65, [48, 138, 158]],
  [1, [24, 62, 152]],
];
const PH_STOPS: Stops = [
  [3, [222, 52, 52]],
  [5, [240, 160, 62]],
  [6.5, [230, 222, 104]],
  [7.5, [92, 190, 112]],
  [8.5, [62, 142, 212]],
  [10, [132, 72, 192]],
];
const MINERAL_STOPS: Stops = [
  [0, [36, 36, 52]],
  [0.5, [124, 98, 62]],
  [1, [246, 204, 84]],
];
const RICH_STOPS: Stops = [
  [0, [20, 22, 36]],
  [1, [68, 12, 92]],
  [5, [59, 82, 139]],
  [10, [33, 145, 140]],
  [16, [94, 201, 98]],
  [24, [253, 231, 37]],
];

function gradientCss(stops: Stops): string {
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `rgb(${c.join(',')}) ${(((v - lo) / (hi - lo)) * 100).toFixed(0)}%`).join(', ')})`;
}

export const LAYERS: { id: Layer; name: string; icon: string; legend?: { css: string; lo: string; hi: string } }[] = [
  { id: 'terrain', name: 'World', icon: '🌍' },
  { id: 'temp', name: 'Temperature', icon: '🌡️', legend: { css: gradientCss(TEMP_STOPS), lo: '-30 °C', hi: '50 °C' } },
  { id: 'moist', name: 'Rainfall', icon: '💧', legend: { css: gradientCss(MOIST_STOPS), lo: 'arid', hi: 'drenched' } },
  { id: 'ph', name: 'Acidity', icon: '🧪', legend: { css: gradientCss(PH_STOPS), lo: 'pH 3', hi: 'pH 10' } },
  { id: 'minerals', name: 'Minerals', icon: '💎', legend: { css: gradientCss(MINERAL_STOPS), lo: 'poor', hi: 'rich' } },
  { id: 'flora', name: 'Flora', icon: '🌿' },
  { id: 'fauna', name: 'Fauna', icon: '🐾' },
  { id: 'richness', name: 'Diversity', icon: '🧬', legend: { css: gradientCss(RICH_STOPS), lo: '0', hi: '24+ species' } },
];

const DS = 5; // display pixels per simulation cell
const out: RGB = [0, 0, 0];

function ramp(stops: Stops, v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const t = (v - a[0]) / (b[0] - a[0]);
      out[0] = a[1][0] + (b[1][0] - a[1][0]) * t;
      out[1] = a[1][1] + (b[1][1] - a[1][1]) * t;
      out[2] = a[1][2] + (b[1][2] - a[1][2]) * t;
      return out;
    }
  }
  return stops[stops.length - 1][1];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const MAX_ZOOM = 12;
/** Zoom at which the landscape starts to show trees, waves and creatures. */
export const DETAIL_ZOOM = 2.6;

/** Deterministic pseudo-random number in [0, 1) for a cell and a salt, so sprites stay put between frames. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x6b43a9b5, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
interface Sprite {
  c: HTMLCanvasElement;
  size: number;
}
const sprites = new Map<string, Sprite>();

/** Emoji are slow to draw as text, so each one is rasterised once per size and reused. */
function getSprite(icon: string, px: number): Sprite {
  const size = Math.max(8, Math.min(192, Math.round(px / 4) * 4));
  const key = `${icon}|${size}`;
  let s = sprites.get(key);
  if (!s) {
    if (sprites.size > 800) sprites.clear();
    const c = document.createElement('canvas');
    const pad = Math.ceil(size * 0.25);
    c.width = c.height = size + pad * 2;
    const x = c.getContext('2d')!;
    x.font = `${size}px ${EMOJI_FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(icon, c.width / 2, c.height / 2 + size * 0.06);
    s = { c, size };
    sprites.set(key, s);
  }
  return s;
}

function drawSprite(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, px: number, flip = false): void {
  if (px < 3) return;
  const s = getSprite(icon, px);
  const d = (s.c.width * px) / s.size;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(s.c, -d / 2, -d / 2, d, d);
    ctx.restore();
  } else ctx.drawImage(s.c, x - d / 2, y - d / 2, d, d);
}

/** Icons that look like flat tiles; up close these are drawn as specks of colour instead. */
const FLAT = new Set(['🟫', '🟩', '🟢', '🦠', '🧫']);

export interface OverlayState {
  hover: number;
  toolRadius: number;
  toolColor: string;
  selected: Species | null;
  showLabels: boolean;
  place?: { cell: number; radius: number } | null;
  regions?: { borders: boolean; selected: number } | null;
}

/** Paints the world: a detailed base map from the simulation grid, plus a live overlay. */
export class MapRenderer {
  readonly DW = W * DS;
  readonly DH = H * DS;
  layer: Layer = 'terrain';
  /** The view: magnification and the centre of the screen, in simulation cells. */
  zoom = 1;
  cx = W / 2;
  cy = H / 2;
  private target: { zoom: number; cx: number; cy: number } | null = null;
  private base: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;

  private bctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private img: ImageData;
  private hElev: Float32Array;
  private hShade: Float32Array;
  private x0 = new Int32Array(W * DS);
  private x1 = new Int32Array(W * DS);
  private fx = new Float32Array(W * DS);
  private y0 = new Int32Array(H * DS);
  private y1 = new Int32Array(H * DS);
  private fy = new Float32Array(H * DS);
  private land = new Float32Array(N * 3);
  private water = new Float32Array(N * 4);
  private rangeCanvas: HTMLCanvasElement;
  private rangeCtx: CanvasRenderingContext2D;
  private rangeImg: ImageData;
  private rangeKey = '';
  private effectStart = new Map<number, number>();
  /** Region borders as segments [x1, y1, x2, y2, regionA, regionB] in cell units. */
  private borders: number[] = [];

  constructor(
    private map: HTMLCanvasElement,
    private over: HTMLCanvasElement,
    private sim: Sim,
  ) {
    // the whole world is painted once into an offscreen image; the view shows a part of it
    this.base = document.createElement('canvas');
    this.base.width = this.DW;
    this.base.height = this.DH;
    this.bctx = this.base.getContext('2d')!;
    this.mctx = map.getContext('2d')!;
    this.octx = over.getContext('2d')!;
    this.img = this.bctx.createImageData(this.DW, this.DH);
    this.rangeCanvas = document.createElement('canvas');
    this.rangeCanvas.width = W;
    this.rangeCanvas.height = H;
    this.rangeCtx = this.rangeCanvas.getContext('2d')!;
    this.rangeImg = this.rangeCtx.createImageData(W, H);

    // the borders between regions, found once
    const ro = sim.regionOf;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        const e = y * W + ((x + 1) % W);
        if (ro[e] !== ro[c]) this.borders.push(x + 1, y, x + 1, y + 1, ro[c], ro[e]);
        if (y < H - 1 && ro[c + W] !== ro[c]) this.borders.push(x, y + 1, x + 1, y + 1, ro[c], ro[c + W]);
      }
    }

    // high-resolution relief: the simulation grid is coarse, but the coastline need not look it
    const { DW, DH } = this;
    const w = sim.world;
    this.hElev = new Float32Array(DW * DH);
    this.hShade = new Float32Array(DW * DH);
    for (let py = 0; py < DH; py++) {
      const v = (py + 0.5) / DH;
      for (let px = 0; px < DW; px++) this.hElev[py * DW + px] = w.elevAt((px + 0.5) / DW, v);
    }
    for (let py = 0; py < DH; py++) {
      for (let px = 0; px < DW; px++) {
        const l = this.hElev[py * DW + ((px + DW - 1) % DW)];
        const r = this.hElev[py * DW + ((px + 1) % DW)];
        const u = this.hElev[Math.max(0, py - 1) * DW + px];
        const d = this.hElev[Math.min(DH - 1, py + 1) * DW + px];
        const s = 1 + (l - r + (u - d)) * 7;
        this.hShade[py * DW + px] = s < 0.72 ? 0.72 : s > 1.28 ? 1.28 : s;
      }
    }
    for (let px = 0; px < DW; px++) {
      const f = (px + 0.5) / DS - 0.5;
      const i = Math.floor(f);
      this.x0[px] = (i + W) % W;
      this.x1[px] = (i + 1 + W) % W;
      this.fx[px] = f - i;
    }
    for (let py = 0; py < DH; py++) {
      const f = (py + 0.5) / DS - 0.5;
      const i = Math.floor(f);
      this.y0[py] = Math.max(0, i);
      this.y1[py] = Math.min(H - 1, i + 1);
      this.fy[py] = f - i;
    }
  }

  // -------------------------------------------------------------------------
  // The view: zoom and pan
  // -------------------------------------------------------------------------

  private clampView(): void {
    this.zoom = clamp(this.zoom, 1, MAX_ZOOM);
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    this.cx = clamp(this.cx, vw / 2, W - vw / 2);
    this.cy = clamp(this.cy, vh / 2, H - vh / 2);
  }

  /** Pointer position as a fraction of the map, and in simulation cells. */
  private pointer(clientX: number, clientY: number): { fx: number; fy: number; x: number; y: number } {
    const r = this.over.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width;
    const fy = (clientY - r.top) / r.height;
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    return { fx, fy, x: this.cx - vw / 2 + fx * vw, y: this.cy - vh / 2 + fy * vh };
  }

  /** Which simulation cell lies under a pointer position? */
  cellAt(clientX: number, clientY: number): number {
    const p = this.pointer(clientX, clientY);
    if (p.fx < 0 || p.fx >= 1 || p.fy < 0 || p.fy >= 1) return -1;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || x >= W || y < 0 || y >= H) return -1;
    return y * W + x;
  }

  /** Zoom by a factor, keeping the spot under the pointer where it is (mouse wheel). */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    this.target = null;
    const p = this.pointer(clientX, clientY);
    this.zoom = clamp(this.zoom * factor, 1, MAX_ZOOM);
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    this.cx = p.x - p.fx * vw + vw / 2;
    this.cy = p.y - p.fy * vh + vh / 2;
    this.clampView();
  }

  /** Glide to a new zoom around the centre of the view (buttons and keys). */
  zoomBy(factor: number): void {
    const z = clamp((this.target?.zoom ?? this.zoom) * factor, 1, MAX_ZOOM);
    this.target = { zoom: z, cx: this.target?.cx ?? this.cx, cy: this.target?.cy ?? this.cy };
  }

  /** Drag the map by a distance in screen pixels. */
  panBy(dxClient: number, dyClient: number): void {
    this.target = null;
    const r = this.over.getBoundingClientRect();
    this.cx -= (dxClient / r.width) * (W / this.zoom);
    this.cy -= (dyClient / r.height) * (H / this.zoom);
    this.clampView();
  }

  /** Move the view by a fraction of its own size (arrow keys). */
  nudge(fx: number, fy: number): void {
    const t = this.target ?? { zoom: this.zoom, cx: this.cx, cy: this.cy };
    this.target = { zoom: t.zoom, cx: t.cx + (fx * W) / t.zoom, cy: t.cy + (fy * H) / t.zoom };
  }

  /** Glide to a place on the map. */
  flyTo(cell: number, zoom: number): void {
    this.target = { zoom: clamp(zoom, 1, MAX_ZOOM), cx: (cell % W) + 0.5, cy: Math.floor(cell / W) + 0.5 };
  }

  resetView(): void {
    this.target = { zoom: 1, cx: W / 2, cy: H / 2 };
  }

  private stepView(): void {
    const t = this.target;
    if (!t) return;
    const vw = W / t.zoom;
    const vh = H / t.zoom;
    const tx = clamp(t.cx, vw / 2, W - vw / 2);
    const ty = clamp(t.cy, vh / 2, H - vh / 2);
    const a = 0.18;
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(t.zoom) - Math.log(this.zoom)) * a);
    this.cx += (tx - this.cx) * a;
    this.cy += (ty - this.cy) * a;
    if (Math.abs(this.zoom - t.zoom) < 0.01 && Math.abs(this.cx - tx) < 0.02 && Math.abs(this.cy - ty) < 0.02) {
      this.zoom = t.zoom;
      this.cx = tx;
      this.cy = ty;
      this.target = null;
    }
    this.clampView();
  }

  // -------------------------------------------------------------------------
  // Base map
  // -------------------------------------------------------------------------

  private terrainColors(): void {
    const w = this.sim.world;
    const { land, water } = this;
    const sea = w.atm.seaLevel;
    for (let c = 0; c < N; c++) {
      const t = w.temp[c];
      const isW = w.isWater[c] === 1;
      const m = isW ? 0.5 : w.moist[c];
      const dry = clamp01((0.62 - m) / 0.5);
      // bare ground: dark wet rock to pale sand
      let r = 112 + (206 - 112) * dry;
      let g = 104 + (182 - 104) * dry;
      let b = 94 + (138 - 94) * dry;
      if (!isW) {
        const hgt = clamp01((w.elev[c] - sea - 0.5) / 0.35);
        r += (128 - r) * hgt * 0.7;
        g += (124 - g) * hgt * 0.7;
        b += (122 - b) * hgt * 0.7;
        const cov = w.cover[c];
        const can = w.canopy[c];
        if (cov > 0.01) {
          // ground cover: lush green where wet, straw where dry, dull olive in the cold
          const cold = clamp01((6 - t) / 12);
          let gr = 92 + (176 - 92) * dry;
          let gg = 152 + (166 - 152) * dry;
          let gb = 62 + (84 - 62) * dry;
          gr += (122 - gr) * cold;
          gg += (132 - gg) * cold;
          gb += (92 - gb) * cold;
          const k = cov * 0.92;
          r += (gr - r) * k;
          g += (gg - g) * k;
          b += (gb - b) * k;
        }
        if (can > 0.01) {
          // forest: deep green in the tropics, blue-green in the north
          const warm = clamp01((t - 4) / 18);
          const fr = 40 + (22 - 40) * warm;
          const fg = 84 + (94 - 84) * warm;
          const fb = 66 + (42 - 66) * warm;
          const k = can * 0.94;
          r += (fr - r) * k;
          g += (fg - g) * k;
          b += (fb - b) * k;
        }
        const sn = clamp01((-2 - t) / 8) * (1 - 0.35 * can);
        if (sn > 0) {
          r += (238 - r) * sn;
          g += (243 - g) * sn;
          b += (249 - b) * sn;
        }
        const ch = w.char[c] * 0.78;
        if (ch > 0) {
          r += (44 - r) * ch;
          g += (34 - g) * ch;
          b += (28 - b) * ch;
        }
      }
      land[c * 3] = r;
      land[c * 3 + 1] = g;
      land[c * 3 + 2] = b;

      // water tint: plankton blooms, kelp forests and sea ice
      let tr = 60;
      let tg = 150;
      let tb = 112;
      let ta = 0;
      if (isW) {
        ta = w.plankton[c] * 0.38;
        const kelp = w.canopy[c] * 0.4;
        if (kelp > 0.01) {
          tr = (tr * ta + 28 * kelp) / (ta + kelp);
          tg = (tg * ta + 96 * kelp) / (ta + kelp);
          tb = (tb * ta + 74 * kelp) / (ta + kelp);
          ta = Math.min(0.6, ta + kelp);
        }
      }
      const ice = clamp01((-0.6 - t) / 1.2) * 0.9;
      if (ice > 0 && (isW || t < -2)) {
        tr += (226 - tr) * ice;
        tg += (237 - tg) * ice;
        tb += (246 - tb) * ice;
        ta = Math.max(ta, ice);
      }
      water[c * 4] = tr;
      water[c * 4 + 1] = tg;
      water[c * 4 + 2] = tb;
      water[c * 4 + 3] = ta;
    }
  }

  private dataColors(): void {
    const sim = this.sim;
    const w = sim.world;
    const { land, water, layer } = this;
    const set = (c: number, rgb: RGB) => {
      land[c * 3] = rgb[0];
      land[c * 3 + 1] = rgb[1];
      land[c * 3 + 2] = rgb[2];
      water[c * 4] = rgb[0];
      water[c * 4 + 1] = rgb[1];
      water[c * 4 + 2] = rgb[2];
      water[c * 4 + 3] = 1;
    };
    if (layer === 'flora' || layer === 'fauna' || layer === 'richness') {
      const alive = sim.alive;
      const wantAuto = layer === 'flora';
      for (let c = 0; c < N; c++) {
        const base = c * MAXS;
        if (layer === 'richness') {
          let n = 0;
          for (const sp of alive) if (sim.pop[base + sp.slot] > 0.5) n++;
          set(c, ramp(RICH_STOPS, n));
          continue;
        }
        let best: Species | null = null;
        let bestP = 0;
        for (const sp of alive) {
          if (sp.derived.auto !== wantAuto) continue;
          const p = sim.pop[base + sp.slot];
          if (p > bestP) {
            bestP = p;
            best = sp;
          }
        }
        if (!best) {
          out[0] = w.isWater[c] ? 16 : 34;
          out[1] = w.isWater[c] ? 22 : 34;
          out[2] = w.isWater[c] ? 40 : 40;
          set(c, out);
        } else {
          const k = 0.35 + 0.65 * clamp01(Math.log10(1 + bestP) / (wantAuto ? 2.6 : 1.8));
          out[0] = best.color[0] * k;
          out[1] = best.color[1] * k;
          out[2] = best.color[2] * k;
          set(c, out);
        }
      }
      return;
    }
    for (let c = 0; c < N; c++) {
      if (layer === 'temp') set(c, ramp(TEMP_STOPS, w.temp[c]));
      else if (layer === 'ph') set(c, ramp(PH_STOPS, w.ph[c]));
      else if (layer === 'moist') {
        if (w.isWater[c]) {
          out[0] = 16;
          out[1] = 30;
          out[2] = 66;
          set(c, out);
        } else set(c, ramp(MOIST_STOPS, w.moist[c]));
      } else {
        const rgb = ramp(MINERAL_STOPS, w.minerals[c]);
        if (w.isWater[c] && w.vent[c] > 0.05) {
          const v = w.vent[c];
          out[0] = rgb[0] + (255 - rgb[0]) * v;
          out[1] = rgb[1] + (92 - rgb[1]) * v;
          out[2] = rgb[2] + (48 - rgb[2]) * v;
          set(c, out);
        } else set(c, rgb);
      }
    }
  }

  renderBase(): void {
    const terrain = this.layer === 'terrain';
    if (terrain) this.terrainColors();
    else this.dataColors();

    const { DW, DH, land, water, hElev, hShade, x0, x1, fx, y0, y1, fy } = this;
    const data = this.img.data;
    const sea = this.sim.world.atm.seaLevel;
    let p = 0;
    for (let py = 0; py < DH; py++) {
      const r0 = y0[py] * W;
      const r1 = y1[py] * W;
      const wy = fy[py];
      for (let px = 0; px < DW; px++, p++) {
        const c00 = r0 + x0[px];
        const c10 = r0 + x1[px];
        const c01 = r1 + x0[px];
        const c11 = r1 + x1[px];
        const wx = fx[px];
        const w00 = (1 - wx) * (1 - wy);
        const w10 = wx * (1 - wy);
        const w01 = (1 - wx) * wy;
        const w11 = wx * wy;
        const e = hElev[p];
        let r: number;
        let g: number;
        let b: number;
        if (e < sea) {
          const d = sea - e;
          const a = water[c00 * 4 + 3] * w00 + water[c10 * 4 + 3] * w10 + water[c01 * 4 + 3] * w01 + water[c11 * 4 + 3] * w11;
          const tr = water[c00 * 4] * w00 + water[c10 * 4] * w10 + water[c01 * 4] * w01 + water[c11 * 4] * w11;
          const tg = water[c00 * 4 + 1] * w00 + water[c10 * 4 + 1] * w10 + water[c01 * 4 + 1] * w01 + water[c11 * 4 + 1] * w11;
          const tb = water[c00 * 4 + 2] * w00 + water[c10 * 4 + 2] * w10 + water[c01 * 4 + 2] * w01 + water[c11 * 4 + 2] * w11;
          if (terrain) {
            let k = d * 2.4;
            if (k > 1) k = 1;
            k = Math.sqrt(k);
            r = 66 + (13 - 66) * k;
            g = 142 + (36 - 142) * k;
            b = 178 + (84 - 178) * k;
            if (a > 0.004) {
              r += (tr - r) * a;
              g += (tg - g) * a;
              b += (tb - b) * a;
            }
            if (d < 0.009) {
              r += 34;
              g += 34;
              b += 28;
            }
          } else {
            const k = d < 0.008 ? 0.45 : 0.82;
            r = tr * k;
            g = tg * k;
            b = tb * k;
          }
        } else {
          const sh = terrain ? hShade[p] : 0.9 + (hShade[p] - 1) * 0.5;
          r = (land[c00 * 3] * w00 + land[c10 * 3] * w10 + land[c01 * 3] * w01 + land[c11 * 3] * w11) * sh;
          g = (land[c00 * 3 + 1] * w00 + land[c10 * 3 + 1] * w10 + land[c01 * 3 + 1] * w01 + land[c11 * 3 + 1] * w11) * sh;
          b = (land[c00 * 3 + 2] * w00 + land[c10 * 3 + 2] * w10 + land[c01 * 3 + 2] * w01 + land[c11 * 3 + 2] * w11) * sh;
        }
        const i = p * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Overlay: ranges, fire, plague, impacts, cursor
  // -------------------------------------------------------------------------

  private updateRange(sp: Species): void {
    const key = `${sp.id}:${this.sim.tick}`;
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    const d = this.rangeImg.data;
    const pop = this.sim.pop;
    const s = sp.slot;
    let max = 0;
    for (let c = 0; c < N; c++) {
      const p = pop[c * MAXS + s];
      if (p > max) max = p;
    }
    const inv = max > 0 ? 1 / Math.log(1 + max) : 0;
    for (let c = 0; c < N; c++) {
      const p = pop[c * MAXS + s];
      const i = c * 4;
      d[i] = 255;
      d[i + 1] = 222;
      d[i + 2] = 40;
      d[i + 3] = p > 0 ? 70 + 170 * Math.log(1 + p) * inv : 0;
    }
    this.rangeCtx.putImageData(this.rangeImg, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Drawing a frame
  // -------------------------------------------------------------------------

  renderView(now: number, st: OverlayState): void {
    this.stepView();
    const rect = this.over.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.round(rect.width * dpr));
    const ch = Math.max(1, Math.round(rect.height * dpr));
    for (const cv of [this.map, this.over]) {
      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw;
        cv.height = ch;
      }
    }
    const vw = W / this.zoom;
    const vh = H / this.zoom;
    const x0 = this.cx - vw / 2;
    const y0 = this.cy - vh / 2;
    const k = cw / vw;
    const ky = ch / vh;
    const sx = (x: number) => (x - x0) * k;
    const sy = (y: number) => (y - y0) * ky;
    const sim = this.sim;
    const w = sim.world;

    // the painted map, cropped and scaled to the view
    const m = this.mctx;
    m.imageSmoothingEnabled = true;
    m.imageSmoothingQuality = 'high';
    m.drawImage(this.base, x0 * DS, y0 * DS, vw * DS, vh * DS, 0, 0, cw, ch);

    const ctx = this.octx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const detail = this.layer === 'terrain' ? clamp01((this.zoom - DETAIL_ZOOM) / 1.4) : 0;

    // things drawn per simulation cell, in cell coordinates
    ctx.setTransform(k, 0, 0, ky, -x0 * k, -y0 * ky);
    if (st.selected?.alive) {
      this.updateRange(st.selected);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = (0.62 + 0.14 * Math.sin(now / 450)) * (1 - 0.55 * detail);
      ctx.drawImage(this.rangeCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    for (const pl of sim.plagues) {
      ctx.fillStyle = `rgba(190, 80, 255, ${(0.45 + 0.25 * Math.sin(now / 160)) * (1 - 0.5 * detail)})`;
      for (const c of pl.active) ctx.fillRect(c % W, Math.floor(c / W), 1, 1);
    }
    if (detail < 1) {
      ctx.globalAlpha = 1 - detail;
      for (const c of sim.fires) {
        const flick = (Math.sin(now / 70 + c * 1.7) + 1) / 2;
        ctx.fillStyle = `rgba(255, ${Math.round(110 + 120 * flick)}, ${Math.round(20 + 40 * flick)}, 0.92)`;
        ctx.fillRect((c % W) - 0.05, Math.floor(c / W) - 0.05, 1.1, 1.1);
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (detail > 0) this.drawDetail(ctx, now, x0, y0, vw, vh, k, ky, detail, st.selected);
    this.drawVolcanoes(ctx, now, sx, sy, k, dpr, cw, ch);

    // continent names fade out as you get closer
    const labelAlpha = this.layer === 'terrain' ? clamp01((4.5 - this.zoom) / 2) : 0;
    if (st.showLabels && labelAlpha > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const cont of w.continents) {
        if (!cont.name || cont.size < 60) continue;
        const lx0 = sx(cont.cx);
        const ly0 = sy(cont.cy + 0.5);
        if (lx0 < -100 || lx0 > cw + 100 || ly0 < -40 || ly0 > ch + 40) continue;
        const size = Math.max(10, Math.min(22, 8 + Math.sqrt(cont.size) * 0.28)) * dpr * Math.min(1.6, Math.sqrt(this.zoom));
        ctx.font = `italic ${size}px "Palatino Linotype", Georgia, serif`;
        const label = cont.name.toUpperCase().split('').join(' ');
        const half = ctx.measureText(label).width / 2 + 4 * dpr;
        const lx = Math.max(half, Math.min(cw - half, lx0));
        const ly = Math.max(size, Math.min(ch - size, ly0));
        ctx.fillStyle = `rgba(0,0,0,${0.35 * labelAlpha})`;
        ctx.fillText(label, lx + dpr, ly + dpr);
        ctx.fillStyle = `rgba(255,255,255,${0.55 * labelAlpha})`;
        ctx.fillText(label, lx, ly);
      }
    }

    // one-shot effects
    for (const fx of sim.effects) {
      let t0 = this.effectStart.get(fx.id);
      if (t0 === undefined) {
        t0 = now;
        this.effectStart.set(fx.id, t0);
      }
      const dur = fx.type === 'meteor' ? 1800 : 1200;
      const t = Math.max(0, (now - t0) / dur);
      if (t > 1) continue;
      const x = sx((fx.cell % W) + 0.5);
      const y = sy(Math.floor(fx.cell / W) + 0.5);
      const rad = fx.radius * k;
      ctx.lineWidth = 2 * dpr;
      if (fx.type === 'meteor') {
        ctx.fillStyle = `rgba(255, 244, 214, ${(1 - t) * 0.9})`;
        ctx.beginPath();
        ctx.arc(x, y, rad * (0.3 + t * 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 150, 60, ${1 - t})`;
        ctx.lineWidth = 4 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, rad * (0.5 + t * 2.4), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const col = fx.type === 'volcano' ? '255, 96, 48' : fx.type === 'plague' ? '200, 96, 255' : fx.type === 'arrive' ? '120, 255, 170' : '255, 232, 120';
        ctx.fillStyle = `rgba(${col}, ${(1 - t) * 0.45})`;
        ctx.beginPath();
        ctx.arc(x, y, rad * (0.4 + t * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${col}, ${1 - t})`;
        ctx.beginPath();
        ctx.arc(x, y, rad * (0.6 + t * 1.4), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.effectStart.size > 200) this.effectStart.clear();

    // regions: faint borders, names when close enough, and the inspected one lit up
    if (st.regions) {
      const sel = st.regions.selected;
      ctx.setTransform(k, 0, 0, ky, -x0 * k, -y0 * ky);
      if (sel >= 0) {
        ctx.fillStyle = 'rgba(79, 209, 197, 0.13)';
        for (const c of sim.regions[sel].cells) ctx.fillRect(c % W, Math.floor(c / W), 1, 1);
      }
      const b = this.borders;
      if (st.regions.borders) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = (1.1 * dpr) / k;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 6) {
          ctx.moveTo(b[i], b[i + 1]);
          ctx.lineTo(b[i + 2], b[i + 3]);
        }
        ctx.stroke();
      }
      if (sel >= 0) {
        ctx.strokeStyle = 'rgba(79, 209, 197, 0.95)';
        ctx.lineWidth = (2.2 * dpr) / k;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 6) {
          if (b[i + 4] !== sel && b[i + 5] !== sel) continue;
          ctx.moveTo(b[i], b[i + 1]);
          ctx.lineTo(b[i + 2], b[i + 3]);
        }
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (st.regions.borders && this.zoom >= 1.8) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const a = Math.min(1, (this.zoom - 1.8) / 0.8);
        for (const r of sim.regions) {
          if (r.water && this.zoom < 2.6) continue;
          const lx = sx(r.cx);
          const ly = sy(r.cy);
          if (lx < -80 || lx > cw + 80 || ly < -20 || ly > ch + 20) continue;
          const size = (r.water ? 10.5 : 11.5) * dpr;
          ctx.font = (r.water ? 'italic ' : '') + '600 ' + size + 'px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = 'rgba(0,0,0,' + 0.45 * a + ')';
          ctx.fillText(r.name, lx + dpr, ly + dpr);
          ctx.fillStyle = r.id === sel ? 'rgba(120,240,225,' + a + ')' : r.water ? 'rgba(190,225,255,' + 0.75 * a + ')' : 'rgba(255,255,255,' + 0.8 * a + ')';
          ctx.fillText(r.name, lx, ly);
        }
      }
    }

    // the inspected place
    if (st.place && st.place.radius >= 0) {
      const px = sx((st.place.cell % W) + 0.5);
      const py = sy(Math.floor(st.place.cell / W) + 0.5);
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.lineDashOffset = -now / 60;
      ctx.strokeStyle = 'rgba(79, 209, 197, 0.95)';
      ctx.beginPath();
      if (st.place.radius) ctx.ellipse(px, py, (st.place.radius + 0.5) * k, (st.place.radius + 0.5) * ky, 0, 0, Math.PI * 2);
      else ctx.rect(px - k / 2, py - ky / 2, k, ky);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // cursor
    if (st.hover >= 0) {
      const hx = st.hover % W;
      const hy = Math.floor(st.hover / W);
      ctx.lineWidth = 1.5 * dpr;
      if (st.toolRadius > 0) {
        ctx.strokeStyle = st.toolColor;
        ctx.fillStyle = st.toolColor.replace(/[\d.]+\)$/, '0.12)');
        ctx.beginPath();
        ctx.ellipse(sx(hx + 0.5), sy(hy + 0.5), (st.toolRadius + 0.5) * k, (st.toolRadius + 0.5) * ky, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(255,255,255,${0.85 - 0.45 * detail})`;
        ctx.strokeRect(sx(hx), sy(hy), k, ky);
      }
    }
  }

  /**
   * The close-up landscape: waves, drifting algae, kelp, forests, grass, mountains, fire and the
   * creatures themselves. Positions are hashed per cell so that nothing jumps between frames, and
   * every sprite is checked against the fine-grained coastline so trees never stand in the sea.
   */
  private drawDetail(ctx: CanvasRenderingContext2D, now: number, x0: number, y0: number, vw: number, vh: number, k: number, ky: number, alpha: number, selected: Species | null): void {
    const sim = this.sim;
    const w = sim.world;
    const pop = sim.pop;
    const { hElev, DW, DH } = this;
    const sea = w.atm.seaLevel;
    const t = now / 1000;
    const dens = Math.max(0.12, Math.min(1, (this.zoom - 2) / 6));
    const xa = Math.max(0, Math.floor(x0));
    const xb = Math.min(W - 1, Math.floor(x0 + vw));
    const ya = Math.max(0, Math.floor(y0));
    const yb = Math.min(H - 1, Math.floor(y0 + vh));

    const animals: Species[] = [];
    const tall: Species[] = [];
    const low: Species[] = [];
    const tiny: Species[] = [];
    for (const sp of sim.alive) {
      if (sp.kind === 'animal') animals.push(sp);
      else if (sp.derived.auto && sp.derived.tall > 0.3) tall.push(sp);
      else if (sp.kind === 'plant') low.push(sp);
      else tiny.push(sp);
    }
    const wet = (x: number, y: number) => {
      const px = Math.min(DW - 1, Math.max(0, Math.floor(x * DS)));
      const py = Math.min(DH - 1, Math.max(0, Math.floor(y * DS)));
      return hElev[py * DW + px] < sea;
    };
    const dominant = (list: Species[], base: number, aquatic: boolean): Species | null => {
      let best: Species | null = null;
      let bp = 0;
      for (const sp of list) {
        if ((sp.genome.habitat === 'aquatic') !== aquatic) continue;
        const p = pop[base + sp.slot];
        if (p > bp) {
          bp = p;
          best = sp;
        }
      }
      return best;
    };
    const specks = (sp: Species, p: number, c: number, cellX: number, cellY: number, maxN: number, rad: number, water: boolean) => {
      const n = Math.round(Math.min(maxN, Math.log10(1 + p) * 3) * dens);
      if (n <= 0) return;
      ctx.fillStyle = `rgb(${sp.color[0]},${sp.color[1]},${sp.color[2]})`;
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        const u = 0.08 + 0.84 * hash(c, sp.id * 31 + j) + Math.sin(t * 0.35 + j * 1.7 + c) * 0.03;
        const v = 0.08 + 0.84 * hash(c, sp.id * 37 + j + 9) + Math.cos(t * 0.3 + j * 2.3) * 0.03;
        if (wet(cellX + u, cellY + v) !== water) continue;
        const px = (cellX + u - x0) * k;
        const py = (cellY + v - y0) * ky;
        ctx.moveTo(px + rad, py);
        ctx.arc(px, py, rad, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    ctx.globalAlpha = alpha;
    const dotR = Math.max(1, k * 0.028);
    const trees: [number, number, number, string][] = [];

    // pass 1: water, ground and plants
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const c = y * W + x;
        const base = c * MAXS;
        if (w.isWater[c]) {
          const frozen = w.temp[c] <= -1.5;
          if (!frozen) {
            // waves
            ctx.lineWidth = Math.max(1, k * 0.022);
            const nw = dens > 0.45 ? 2 : 1;
            for (let i = 0; i < nw; i++) {
              const u = 0.15 + 0.7 * hash(c, i * 7 + 1);
              const v = 0.15 + 0.7 * hash(c, i * 7 + 2);
              if (!wet(x + u, y + v)) continue;
              const ph = t * 1.3 + hash(c, i * 7 + 3) * 6.28;
              const px = (x + u - x0) * k;
              const py = (y + v - y0) * ky + Math.sin(ph) * k * 0.025;
              const len = k * 0.2;
              ctx.strokeStyle = `rgba(225,240,255,${0.16 + 0.12 * Math.sin(ph)})`;
              ctx.beginPath();
              ctx.moveTo(px - len, py);
              ctx.quadraticCurveTo(px, py - len * 0.4, px + len, py);
              ctx.stroke();
            }
          }
          // hydrothermal vents: a glowing smoker and rising bubbles
          if (w.vent[c] > 0.5 && w.cls[c] === 0) {
            const vx = (x + 0.5 - x0) * k;
            const vy = (y + 0.75 - y0) * ky;
            ctx.fillStyle = 'rgba(255,120,60,0.35)';
            ctx.beginPath();
            ctx.arc(vx, vy, k * 0.09, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = Math.max(1, k * 0.012);
            for (let j = 0; j < 4; j++) {
              const ph = (t * 0.45 + hash(c, j + 40)) % 1;
              ctx.strokeStyle = `rgba(210,240,255,${(1 - ph) * 0.7})`;
              ctx.beginPath();
              ctx.arc(vx + (hash(c, j + 50) - 0.5) * k * 0.3 + Math.sin(ph * 9) * k * 0.03, vy - ph * k * 0.65, k * 0.022 * (1 + ph), 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          // drifting microbes and algae: the soup of the early seas
          if (this.zoom >= 3.4) {
            let a: Species | null = null;
            let b: Species | null = null;
            let pa = 0;
            let pb = 0;
            for (const list of [tiny, low]) {
              for (const sp of list) {
                if (sp.genome.habitat !== 'aquatic') continue;
                const p = pop[base + sp.slot];
                if (p > pa) {
                  b = a;
                  pb = pa;
                  a = sp;
                  pa = p;
                } else if (p > pb) {
                  b = sp;
                  pb = p;
                }
              }
            }
            if (a) specks(a, pa, c, x, y, 12, a.kind === 'microbe' ? dotR : dotR * 1.5, true);
            if (b) specks(b, pb, c, x, y, 8, b.kind === 'microbe' ? dotR : dotR * 1.5, true);
          }
          // kelp forests
          if (w.canopy[c] > 0.15) {
            const kelp = dominant(tall, base, true);
            const n = Math.max(1, Math.round(w.canopy[c] * 3 * dens));
            for (let i = 0; i < n; i++) {
              const u = 0.15 + 0.7 * hash(c, i * 5 + 60);
              const v = 0.15 + 0.7 * hash(c, i * 5 + 61);
              if (!wet(x + u, y + v)) continue;
              trees.push([(x + u - x0) * k + Math.sin(t * 0.8 + i + c) * k * 0.015, (y + v - y0) * ky, k * 0.4 * (0.85 + 0.3 * hash(c, i * 5 + 62)), kelp?.icon ?? '🌿']);
            }
          }
          continue;
        }

        // land
        if (w.burning[c]) {
          for (let i = 0; i < 2; i++) {
            const u = 0.25 + 0.5 * hash(c, i + 80);
            const v = 0.3 + 0.45 * hash(c, i + 81);
            if (wet(x + u, y + v)) continue;
            const s = k * 0.42 * (0.85 + 0.18 * Math.sin(t * 13 + i * 2 + c));
            trees.push([(x + u - x0) * k, (y + v - y0) * ky, s, '🔥']);
          }
          continue;
        }
        const can = w.canopy[c];
        const cov = w.cover[c];
        const h = w.elev[c] - sea;
        if (can > 0.12) {
          const tree = dominant(tall, base, false);
          const icon = tree && !FLAT.has(tree.icon) ? tree.icon : w.temp[c] < 8 ? '🌲' : '🌳';
          // one or two trees per patch, on opposite halves so they do not pile up
          const n = can > 0.55 && dens > 0.4 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const u = n === 1 ? 0.25 + 0.5 * hash(c, 1) : i * 0.5 + 0.1 + 0.3 * hash(c, i * 3 + 1);
            const v = 0.2 + 0.6 * hash(c, i * 3 + 2);
            if (wet(x + u, y + v)) continue;
            trees.push([(x + u - x0) * k, (y + v - y0) * ky, k * (0.5 + 0.18 * can) * (0.85 + 0.3 * hash(c, i * 3 + 3)), icon]);
          }
        }
        if (cov > 0.1 && can < 0.6) {
          const herb = dominant(low, base, false);
          if (herb?.icon === '🌾') {
            // a meadow: blades of grass swaying in the wind, green where it rains and straw where it is dry
            const dry = Math.min(1, Math.max(0, (0.6 - w.moist[c]) / 0.4));
            const r = Math.round(110 + 95 * dry);
            const gg = Math.round(175 - 10 * dry);
            const b = Math.round(70 + 20 * dry);
            ctx.strokeStyle = `rgb(${r},${gg},${b})`;
            ctx.lineWidth = Math.max(1, k * 0.013);
            ctx.lineCap = 'round';
            ctx.beginPath();
            const blades = Math.max(5, Math.round(cov * 34 * dens));
            for (let j = 0; j < blades; j++) {
              const u = 0.05 + 0.9 * hash(c, j * 2 + 200);
              const v = 0.1 + 0.85 * hash(c, j * 2 + 201);
              if (wet(x + u, y + v)) continue;
              const px = (x + u - x0) * k;
              const py = (y + v - y0) * ky;
              const len = k * (0.07 + 0.06 * hash(c, j + 300));
              const sway = Math.sin(t * 1.7 + u * 7 + y * 0.9) * len * 0.4;
              ctx.moveTo(px, py);
              ctx.quadraticCurveTo(px + sway * 0.2, py - len * 0.6, px + sway, py - len);
            }
            ctx.stroke();
            if (dens > 0.45 && hash(c, 210) < 0.6 && !wet(x + 0.6, y + 0.55)) {
              trees.push([(x + 0.25 + 0.5 * hash(c, 211) - x0) * k, (y + 0.3 + 0.5 * hash(c, 212) - y0) * ky, k * 0.26, '🌾']);
            }
          } else if (herb && FLAT.has(herb.icon)) specks(herb, pop[base + herb.slot], c, x, y, 10, dotR * 1.6, false);
          else {
            const icon = herb?.icon ?? '🌱';
            const n = cov > 0.5 && dens > 0.4 ? 2 : 1;
            for (let i = 0; i < n; i++) {
              const u = 0.12 + 0.76 * hash(c, i * 3 + 20);
              const v = 0.12 + 0.76 * hash(c, i * 3 + 21);
              if (wet(x + u, y + v)) continue;
              trees.push([(x + u - x0) * k, (y + v - y0) * ky, k * 0.27 * (0.85 + 0.3 * hash(c, i * 3 + 22)), icon]);
            }
          }
        }
        if (can < 0.3 && h > 0.55 && hash(c, 77) < 0.55 && !wet(x + 0.5, y + 0.6)) {
          trees.push([(x + 0.5 - x0) * k, (y + 0.55 - y0) * ky, k * 0.7, w.temp[c] < 0 ? '🏔️' : '⛰️']);
        }
      }
    }
    // draw back to front so nearer things overlap farther ones
    trees.sort((p, q) => p[1] - q[1]);
    for (const [px, py, s, icon] of trees) drawSprite(ctx, icon, px, py, s);

    // pass 2: animals, wandering about their patch
    const maxSpecies = this.zoom < 5 ? 1 : 2;
    const top: Species[] = [];
    const topP: number[] = [];
    const creatures: [number, number, number, string, boolean, boolean][] = [];
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const c = y * W + x;
        const base = c * MAXS;
        top.length = 0;
        topP.length = 0;
        for (const sp of animals) {
          const p = pop[base + sp.slot];
          if (p < 0.3) continue;
          let i = top.length;
          while (i > 0 && topP[i - 1] < p) i--;
          if (i >= maxSpecies) continue;
          top.splice(i, 0, sp);
          topP.splice(i, 0, p);
          if (top.length > maxSpecies) {
            top.pop();
            topP.pop();
          }
        }
        for (let r = 0; r < top.length; r++) {
          const sp = top[r];
          const g = sp.genome;
          const p = topP[r];
          // a thin scatter: denser populations show up in more places
          const presence = Math.min(0.85, 0.3 + Math.log10(1 + p) * 0.22) * (r === 0 ? 1 : 0.55);
          if (hash(c, sp.id * 7 + 99) > presence) continue;
          const count = this.zoom >= 8 && p > 30 ? 2 : 1;
          const size = k * Math.min(0.7, Math.max(0.28, 0.2 + 0.05 * g.size));
          const pace = 0.25 + 0.7 * g.speed + 0.5 * g.flight;
          for (let j = 0; j < count; j++) {
            const ph = hash(c, sp.id * 11 + j) * 6.28;
            const u = 0.15 + 0.7 * hash(c, sp.id * 13 + j + 3) + Math.sin(t * pace * 0.6 + ph) * 0.12;
            let v = 0.15 + 0.7 * hash(c, sp.id * 17 + j + 5) + Math.cos(t * pace * 0.45 + ph * 1.3) * 0.08;
            if (g.flight > 0.4) v -= 0.12 + Math.sin(t * 3 + ph) * 0.04;
            const water = wet(x + u, y + v);
            if (g.habitat === 'aquatic' && !water) continue;
            if (g.habitat === 'terrestrial' && water && g.flight <= 0.4) continue;
            // emoji face left; flip them while they wander to the right
            const flip = Math.cos(t * pace * 0.6 + ph) > 0;
            creatures.push([(x + u - x0) * k, (y + v - y0) * ky, size, sp.icon, flip, sp === selected]);
          }
        }
      }
    }
    creatures.sort((p, q) => p[1] - q[1]);
    for (const [px, py, s, icon, flip, sel] of creatures) {
      // a soft shadow lifts the creature off the foliage
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py + s * 0.36, s * 0.42, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = 'rgba(242,193,78,0.95)';
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        ctx.ellipse(px, py + s * 0.38, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawSprite(ctx, icon, px, py, s, flip);
    }
    ctx.globalAlpha = 1;
  }

  /** Volcanoes stay on the map as landmarks, smoking for a while after they erupt. */
  private drawVolcanoes(ctx: CanvasRenderingContext2D, now: number, sx: (x: number) => number, sy: (y: number) => number, k: number, dpr: number, cw: number, ch: number): void {
    const sim = this.sim;
    const w = sim.world;
    const t = now / 1000;
    for (const v of sim.volcanoes) {
      const age = sim.tick - v.tick;
      const activity = clamp01(1 - age / VOLCANO_LIFE);
      const x = sx((v.cell % W) + 0.5);
      const y = sy(Math.floor(v.cell / W) + 0.5);
      if (x < -60 || x > cw + 60 || y < -80 || y > ch + 40) continue;
      const water = w.isWater[v.cell] === 1;
      const size = Math.max(16 * dpr, k * 1.4);
      if (!water) {
        if (activity <= 0 && this.zoom < DETAIL_ZOOM) continue;
        if (activity > 0.6) {
          ctx.fillStyle = `rgba(255,90,30,${0.25 * activity * (0.8 + 0.2 * Math.sin(t * 6))})`;
          ctx.beginPath();
          ctx.arc(x, y - size * 0.2, size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        drawSprite(ctx, '🌋', x, y, size);
      }
      if (activity <= 0) continue;
      // smoke over land, steam over the sea
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.3 + i / 5) % 1;
        const r = size * (0.12 + ph * 0.28);
        const px = x + Math.sin(ph * 5 + i) * size * 0.2 + ph * size * 0.35;
        const py = y - size * 0.45 - ph * size * 1.3;
        ctx.fillStyle = water ? `rgba(235,240,250,${(1 - ph) * 0.45 * activity})` : `rgba(95,92,100,${(1 - ph) * 0.55 * activity})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
