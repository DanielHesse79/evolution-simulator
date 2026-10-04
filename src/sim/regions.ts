import { RNG } from './rng';
import { N, W, type World } from './world';

/**
 * The world divided into named regions: each continent into areas of a few hundred thousand km²,
 * the oceans into seas. Regions are drawn once from the young world's geography and keep their
 * names for the whole game, so the player can follow what happens in "Northern Valor Highlands".
 */
export interface Region {
  id: number;
  name: string;
  water: boolean;
  cells: number[];
  /** Label position, in cells. */
  cx: number;
  cy: number;
}

const LAND_SIZE = 70;
const SEA_SIZE = 320;

const SEA_A = ['Amber', 'Silent', 'Coral', 'Grey', 'Jade', 'Storm', 'Mirror', 'Sunken', 'Pale', 'Bright', 'Cold', 'Warm', 'Salt', 'Iron', 'Glass', 'Weeping', 'Hollow', 'Dawn', 'Dusk', 'Whale', 'Ember', 'Pearl', 'Shadow', 'Copper', 'Azure', 'Thunder', 'Mist', 'Serpent'];

function wrapDx(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > W / 2) d = W - d;
  return d;
}

/** Pick k well-spread seed cells from a set (farthest-point sampling), then give each cell to its nearest seed. */
function partition(cells: number[], k: number, rng: RNG): number[][] {
  if (k <= 1 || cells.length <= k) return [cells];
  const xs = cells.map((c) => c % W);
  const ys = cells.map((c) => Math.floor(c / W));
  const seeds: number[] = [rng.int(cells.length)];
  const best = new Float64Array(cells.length).fill(Infinity);
  while (seeds.length < k) {
    const s = seeds[seeds.length - 1];
    let far = 0;
    let farI = 0;
    for (let i = 0; i < cells.length; i++) {
      const d = wrapDx(xs[i], xs[s]) ** 2 + (ys[i] - ys[s]) ** 2;
      if (d < best[i]) best[i] = d;
      if (best[i] > far) {
        far = best[i];
        farI = i;
      }
    }
    seeds.push(farI);
  }
  // a couple of rounds of k-means make the regions rounder
  let cx = seeds.map((s) => xs[s]);
  let cy = seeds.map((s) => ys[s]);
  const owner = new Int32Array(cells.length);
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < cells.length; i++) {
      let bd = Infinity;
      for (let j = 0; j < k; j++) {
        const d = wrapDx(xs[i], cx[j]) ** 2 + (ys[i] - cy[j]) ** 2;
        if (d < bd) {
          bd = d;
          owner[i] = j;
        }
      }
    }
    const sx = new Float64Array(k);
    const sxs = new Float64Array(k);
    const sy = new Float64Array(k);
    const n = new Float64Array(k);
    for (let i = 0; i < cells.length; i++) {
      const a = (xs[i] / W) * Math.PI * 2;
      sx[owner[i]] += Math.cos(a);
      sxs[owner[i]] += Math.sin(a);
      sy[owner[i]] += ys[i];
      n[owner[i]]++;
    }
    cx = cx.map((v, j) => {
      if (!n[j]) return v;
      let a = Math.atan2(sxs[j], sx[j]);
      if (a < 0) a += Math.PI * 2;
      return (a / (Math.PI * 2)) * W;
    });
    cy = cy.map((v, j) => (n[j] ? sy[j] / n[j] : v));
  }
  const groups: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < cells.length; i++) groups[owner[i]].push(cells[i]);
  return groups.filter((g) => g.length);
}

function centre(cells: number[]): { cx: number; cy: number } {
  let sx = 0;
  let sxs = 0;
  let sy = 0;
  for (const c of cells) {
    const a = ((c % W) / W) * Math.PI * 2;
    sx += Math.cos(a);
    sxs += Math.sin(a);
    sy += Math.floor(c / W);
  }
  let a = Math.atan2(sxs, sx);
  if (a < 0) a += Math.PI * 2;
  return { cx: (a / (Math.PI * 2)) * W + 0.5, cy: sy / cells.length + 0.5 };
}

export function buildRegions(w: World, seed: number): { regions: Region[]; regionOf: Int16Array } {
  const rng = new RNG(seed * 13 + 5);
  const regions: Region[] = [];
  const regionOf = new Int16Array(N).fill(-1);
  const used = new Set<string>();
  const unique = (name: string) => {
    let n = name;
    for (let i = 2; used.has(n); i++) n = `${name} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i] ?? i}`;
    used.add(n);
    return n;
  };
  const add = (cells: number[], name: string, water: boolean) => {
    const id = regions.length;
    for (const c of cells) regionOf[c] = id;
    regions.push({ id, name: unique(name), water, cells, ...centre(cells) });
  };

  // land: every continent split into areas
  const sea = w.atm.seaLevel;
  const byContinent = new Map<number, number[]>();
  for (let c = 0; c < N; c++) {
    if (w.isWater[c]) continue;
    const id = w.continent[c];
    const list = byContinent.get(id) ?? [];
    list.push(c);
    byContinent.set(id, list);
  }
  const islands: number[] = [];
  for (const [id, cells] of byContinent) {
    const cont = w.continents[id];
    if (!cont?.name || cells.length < 20) {
      islands.push(...cells);
      continue;
    }
    const groups = partition(cells, Math.max(1, Math.round(cells.length / LAND_SIZE)), rng);
    const whole = centre(cells);
    for (const g of groups) {
      // what kind of country is it?
      let elev = 0;
      let moist = 0;
      let lat = 0;
      let coast = 0;
      for (const c of g) {
        elev += w.elev[c] - sea;
        moist += w.baseMoist[c];
        lat += w.absLat[c];
        if (w.distCoast[c] <= 1) coast++;
      }
      elev /= g.length;
      moist /= g.length;
      lat /= g.length;
      const coastal = coast / g.length > 0.55;
      let noun: string;
      if (lat > 0.84) noun = 'Frostlands';
      else if (elev > 0.5) noun = 'Highlands';
      else if (lat > 0.66) noun = coastal ? 'Fjords' : 'Tundra';
      else if (coastal) noun = 'Coast';
      else if (elev > 0.3) noun = 'Uplands';
      else if (moist < -0.12) noun = lat < 0.35 ? 'Desert' : 'Steppe';
      else if (moist > 0.14) noun = lat < 0.3 ? 'Wetlands' : 'Lowlands';
      else noun = 'Plains';
      let dir = '';
      if (groups.length > 1) {
        const c = centre(g);
        let dx = c.cx - whole.cx;
        if (dx > W / 2) dx -= W;
        if (dx < -W / 2) dx += W;
        const dy = c.cy - whole.cy;
        if (Math.hypot(dx, dy * 1.4) < 4) dir = 'Central';
        else {
          const a = Math.atan2(-dy * 1.4, dx);
          const dirs = ['Eastern', 'North-Eastern', 'Northern', 'North-Western', 'Western', 'South-Western', 'Southern', 'South-Eastern'];
          dir = dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8];
        }
      }
      add(g, `${dir ? `${dir} ` : ''}${cont.name} ${noun}`, false);
    }
  }
  if (islands.length) {
    for (const g of partition(islands, Math.max(1, Math.round(islands.length / LAND_SIZE)), rng)) add(g, `The ${rng.pick(SEA_A)} Isles`, false);
  }

  // water: seas and oceans
  const water: number[] = [];
  for (let c = 0; c < N; c++) if (w.isWater[c]) water.push(c);
  for (const g of partition(water, Math.max(1, Math.round(water.length / SEA_SIZE)), rng)) {
    let shallow = 0;
    let lat = 0;
    for (const c of g) {
      if (w.cls[c] === 1) shallow++;
      lat += w.absLat[c];
    }
    lat /= g.length;
    const kind = lat > 0.86 ? 'Polar Sea' : shallow / g.length > 0.45 ? 'Shallows' : g.length > SEA_SIZE * 1.1 ? 'Ocean' : 'Sea';
    add(g, `The ${rng.pick(SEA_A)} ${kind}`, true);
  }

  // anything left over (cannot really happen) joins its neighbour
  for (let c = 0; c < N; c++) {
    if (regionOf[c] >= 0) continue;
    const x = c % W;
    const y = Math.floor(c / W);
    regionOf[c] = regionOf[y * W + ((x + 1) % W)] >= 0 ? regionOf[y * W + ((x + 1) % W)] : 0;
  }
  return { regions, regionOf };
}
