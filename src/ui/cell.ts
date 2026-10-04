import { isAuto, massKg, type Genome } from '../sim/genome';
import { RNG } from '../sim/rng';

/**
 * How we imagine the cells of a species. The drawing is generated from the genome: a prokaryote
 * gets a naked DNA loop and a whip, a plant cell gets chloroplasts and a stiff wall, an animal
 * cell gets more mitochondria the more active the animal is, and so on.
 */

const CX = 380;
const CY = 220;
const f = (v: number) => v.toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export interface CellPart {
  name: string;
  color: string;
  desc: string;
}

export interface CellType {
  icon: string;
  name: string;
  desc: string;
}

export interface CellModel {
  svg: string;
  title: string;
  subtitle: string;
  intro: string;
  parts: CellPart[];
  tissues: CellType[];
}

interface Shape {
  path: string;
  inside: (x: number, y: number, margin: number) => boolean;
}

function capsule(a: number, b: number): Shape {
  return {
    path: `M${CX - a + b},${CY - b} H${CX + a - b} A${b},${b} 0 0 1 ${CX + a - b},${CY + b} H${CX - a + b} A${b},${b} 0 0 1 ${CX - a + b},${CY - b} Z`,
    inside: (x, y, m) => Math.hypot(Math.max(0, Math.abs(x - CX) - (a - b)), y - CY) < b - m,
  };
}

function roundRect(hw: number, hh: number, r: number): Shape {
  return {
    path: `M${CX - hw + r},${CY - hh} H${CX + hw - r} Q${CX + hw},${CY - hh} ${CX + hw},${CY - hh + r} V${CY + hh - r} Q${CX + hw},${CY + hh} ${CX + hw - r},${CY + hh} H${CX - hw + r} Q${CX - hw},${CY + hh} ${CX - hw},${CY + hh - r} V${CY - hh + r} Q${CX - hw},${CY - hh} ${CX - hw + r},${CY - hh} Z`,
    inside: (x, y, m) => {
      const dx = Math.abs(x - CX);
      const dy = Math.abs(y - CY);
      if (dx > hw - m || dy > hh - m) return false;
      if (dx > hw - r && dy > hh - r) return Math.hypot(dx - (hw - r), dy - (hh - r)) < r - m;
      return true;
    },
  };
}

function smooth(pts: [number, number][]): string {
  const n = pts.length;
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const s = mid(pts[n - 1], pts[0]);
  let d = `M${f(s[0])},${f(s[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])}`;
  }
  return `${d}Z`;
}

/** A soft, wobbly outline: the shape of a cell without a wall. */
function blob(rx: number, ry: number, rng: RNG, wobble: number): Shape {
  const terms = [2, 3, 5].map((n) => ({ n, amp: wobble * rng.range(0.4, 1), ph: rng.range(0, 6.28) }));
  const R = (th: number) => 1 + terms.reduce((s, t) => s + t.amp * Math.sin(t.n * th + t.ph), 0);
  const pts: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const th = (i / 48) * Math.PI * 2;
    pts.push([CX + rx * R(th) * Math.cos(th), CY + ry * R(th) * Math.sin(th)]);
  }
  return {
    path: smooth(pts),
    inside: (x, y, m) => {
      const nx = (x - CX) / rx;
      const ny = (y - CY) / ry;
      return Math.hypot(nx, ny) < R(Math.atan2(ny, nx)) - m / ((rx + ry) / 2);
    },
  };
}

function edgePoint(sh: Shape, theta: number): [number, number] {
  let lo = 0;
  let hi = 420;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sh.inside(CX + c * mid, CY + s * mid, 0)) lo = mid;
    else hi = mid;
  }
  return [CX + c * lo, CY + s * lo];
}

/** A beating whip, animated as a travelling wave. */
function flagellum(sh: Shape, theta: number, len: number): string {
  const [ex, ey] = edgePoint(sh, theta);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const wave = (phase: number) => {
    const pts: string[] = [];
    for (let s = 0; s <= len; s += 5) {
      const amp = 11 * Math.min(1, s / 35);
      const o = amp * Math.sin((s / 42) * Math.PI * 2 - phase);
      pts.push(`${f(ex + dx * s - dy * o)},${f(ey + dy * s + dx * o)}`);
    }
    return `M${pts.join(' L')}`;
  };
  const frames = [0, 1, 2, 3, 4].map((i) => wave((i * Math.PI) / 2));
  return `<path d="${frames[0]}" fill="none" stroke="#dbe4f5" stroke-width="3" stroke-linecap="round" opacity="0.85"><animate attributeName="d" dur="0.9s" repeatCount="indefinite" values="${frames.join(';')}"/></path>`;
}

function nucleus(x: number, y: number, r: number, rng: RNG): string {
  let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="#5b4b9a" fill-opacity="0.9" stroke="#b9a8ff" stroke-width="3" stroke-dasharray="9 5"/>`;
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, 6.28);
    const rr = rng.range(0, r * 0.6);
    s += `<path d="M${f(x + Math.cos(a) * rr)},${f(y + Math.sin(a) * rr)} q${f(rng.range(-12, 12))},${f(rng.range(-12, 12))} ${f(rng.range(-16, 16))},${f(rng.range(-16, 16))}" stroke="#d6ccff" stroke-width="2" fill="none" opacity="0.55"/>`;
  }
  return `${s}<circle cx="${f(x + r * 0.22)}" cy="${f(y - r * 0.15)}" r="${f(r * 0.3)}" fill="#3a2d6e"/>`;
}

function mitochondrion(x: number, y: number, len: number, ang: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 6; i++) pts.push(`${f(-0.72 * len + (i * 1.44 * len) / 6)},${f((i % 2 ? 1 : -1) * len * 0.28)}`);
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><ellipse rx="${len}" ry="${f(len * 0.48)}" fill="#d9714a" stroke="#ffb08a" stroke-width="2.5"/><polyline points="${pts.join(' ')}" fill="none" stroke="#ffd7c2" stroke-width="2"/></g>`;
}

function chloroplast(x: number, y: number, len: number, ang: number): string {
  let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><ellipse rx="${len}" ry="${f(len * 0.55)}" fill="#2f8f45" stroke="#9be59f" stroke-width="2.5"/><line x1="${f(-len * 0.75)}" x2="${f(len * 0.75)}" y1="0" y2="0" stroke="#6fcf7a" stroke-width="1.5"/>`;
  for (let i = -1; i <= 1; i++) {
    const gx = i * len * 0.48;
    s += `<rect x="${f(gx - 6)}" y="${f(-len * 0.28)}" width="12" height="${f(len * 0.56)}" rx="3" fill="#185c28"/>`;
    for (let j = 1; j <= 3; j++) {
      const ly = -len * 0.28 + (j * len * 0.56) / 4;
      s += `<line x1="${f(gx - 6)}" x2="${f(gx + 6)}" y1="${f(ly)}" y2="${f(ly)}" stroke="#9be59f" stroke-width="1"/>`;
    }
  }
  return `${s}</g>`;
}

function golgi(x: number, y: number, ang: number): string {
  let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})">`;
  for (let i = 0; i < 4; i++) {
    const r = 26 - i * 4.5;
    s += `<path d="M${-r},${i * 7 - 8} Q0,${i * 7 - 22} ${r},${i * 7 - 8}" fill="none" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>`;
  }
  return `${s}<circle cx="30" cy="4" r="4" fill="#f2c14e"/><circle cx="-29" cy="10" r="3.5" fill="#f2c14e"/></g>`;
}

function reticulum(x: number, y: number, r: number, rng: RNG): string {
  let s = '';
  const a0 = rng.range(0, 6.28);
  for (let i = 0; i < 3; i++) {
    const R = r + 12 + i * 10;
    const pts: string[] = [];
    for (let a = 0; a <= 2.4; a += 0.08) {
      const rr = R + Math.sin(a * 9 + i) * 3.5;
      pts.push(`${f(x + Math.cos(a0 + a) * rr)},${f(y + Math.sin(a0 + a) * rr)}`);
    }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#4fd1c5" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>`;
  }
  return s;
}

function nucleoid(x: number, y: number, r: number, rng: RNG): string {
  let s = '';
  for (let k = 0; k < 2; k++) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const rr = r * (k ? 0.55 : 1) + rng.range(-r * 0.3, r * 0.3);
      pts.push([x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr * 0.8]);
    }
    s += `<path d="${smooth(pts)}" fill="none" stroke="#b9a8ff" stroke-width="3" opacity="${k ? 0.6 : 0.9}"/>`;
  }
  return s;
}

const fmtBig = (n: number): string => {
  const words: [number, string][] = [
    [1e15, 'quadrillion'],
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [v, w] of words) if (n >= v) return `${(n / v).toFixed(n / v >= 10 ? 0 : 1)} ${w}`;
  return Math.round(n).toString();
};

export function buildCell(g: Genome, seed: number): CellModel {
  const rng = new RNG(seed * 7919 + 17);
  const auto = isAuto(g);
  const photo = g.diet === 'photo';
  const chemo = g.diet === 'chemo';
  const prok = g.tier === 0;
  const multi = g.tier >= 2;
  const plantLike = auto && !prok;
  const hunter = g.diet === 'carn' || g.diet === 'omni';

  const body: string[] = [];
  const outside: string[] = [];
  const labels: { x: number; y: number; text: string }[] = [];
  const parts: CellPart[] = [];
  const occupied: { x: number; y: number; r: number }[] = [];
  const part = (name: string, color: string, desc: string, at?: [number, number]) => {
    parts.push({ name, color, desc });
    if (at) labels.push({ x: at[0], y: at[1], text: name });
  };

  let shape: Shape;
  let cyto: [string, string];
  if (prok) {
    shape = capsule(165, 82);
    cyto = ['#2a4563', '#152437'];
  } else if (plantLike && multi) {
    shape = roundRect(200, 148, 36);
    cyto = ['#28503a', '#13281c'];
  } else if (plantLike) {
    shape = blob(175, 135, rng, 0.03);
    cyto = ['#28503a', '#13281c'];
  } else if (!multi) {
    shape = blob(180, 138, rng, hunter ? 0.13 : 0.05);
    cyto = ['#3d2e4d', '#20172a'];
  } else {
    shape = blob(185, 140, rng, 0.06);
    cyto = ['#45293d', '#241622'];
  }

  const place = (r: number): [number, number] | null => {
    for (let i = 0; i < 1500; i++) {
      const x = CX + rng.range(-230, 230);
      const y = CY + rng.range(-160, 160);
      if (!shape.inside(x, y, r + 5)) continue;
      if (occupied.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 3)) continue;
      occupied.push({ x, y, r });
      return [x, y];
    }
    return null;
  };
  const many = (n: number, r: number, draw: (x: number, y: number) => string): [number, number] | null => {
    let first: [number, number] | null = null;
    for (let i = 0; i < n; i++) {
      const p = place(r);
      if (!p) continue;
      first ??= p;
      body.push(draw(p[0], p[1]));
    }
    return first;
  };

  let mitoCount = 0;
  if (prok) {
    if (photo) {
      for (let i = 1; i <= 3; i++) body.push(`<path d="${capsule(165 - 15 * i, 82 - 15 * i).path}" fill="none" stroke="#58c26a" stroke-width="3" opacity="${0.85 - i * 0.12}"/>`);
      part('Thylakoids', '#58c26a', 'Folded membranes that catch sunlight and split water. The oxygen they give off is what slowly fills your sky and makes complex life possible.', [CX + 70, CY - 67]);
    }
    const nr = photo ? 32 : 44;
    occupied.push({ x: CX - 10, y: CY, r: nr * 1.25 });
    body.push(nucleoid(CX - 10, CY, nr, rng));
    part('Nucleoid', '#b9a8ff', 'A single loop of naked DNA. There is no nucleus yet: that is what makes this a prokaryote.', [CX - 10, CY - nr * 0.8]);
    const pl = many(2, 10, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="none" stroke="#d6ccff" stroke-width="2"/>`);
    if (pl) part('Plasmids', '#d6ccff', 'Little rings of extra genes that bacteria swap with each other, sharing new tricks across species.', pl);
    if (chemo) {
      const sg = many(6, 8, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#f6e05e" stroke="#fff3a8" stroke-width="1.5"/>`);
      if (sg) part('Sulfur granules', '#f6e05e', 'Stored chemical fuel from the vents. This cell lives on chemistry, not sunlight, and needs no oxygen at all.', sg);
    }
  } else {
    // eukaryotes
    let nx: number;
    let ny: number;
    const nr = plantLike ? 40 : 48;
    if (plantLike && multi) {
      body.push(`<ellipse cx="${CX + 55}" cy="${CY + 12}" rx="105" ry="80" fill="#8fd3f0" fill-opacity="0.18" stroke="#8fd3f0" stroke-opacity="0.75" stroke-width="2.5"/>`);
      occupied.push({ x: CX + 55, y: CY + 12, r: 84 });
      part('Central vacuole', '#8fd3f0', 'A big water tank that keeps the cell firm. A thirsty plant wilts: one reason drought hits forests hard.', [CX + 55, CY - 60]);
      nx = CX - 128;
      ny = CY - 45;
    } else {
      nx = CX - 20 + rng.range(-15, 15);
      ny = CY + rng.range(-10, 15);
    }
    occupied.push({ x: nx, y: ny, r: nr + 26 });
    body.push(reticulum(nx, ny, nr, rng));
    body.push(nucleus(nx, ny, nr, rng));
    part('Nucleus', '#7a66c9', 'Wraps the DNA in its own envelope. The great leap behind all complex life; in this world it needs about 1% oxygen in the air before it can evolve.', [nx, ny - nr * 0.6]);
    part('Endoplasmic reticulum', '#4fd1c5', 'A folded network around the nucleus where proteins and fats are made.', [nx + nr + 14, ny + 6]);

    const gp = place(28);
    if (gp) {
      body.push(golgi(gp[0], gp[1], rng.range(0, 180)));
      part('Golgi apparatus', '#f2c14e', 'Packs the cell’s products into little bubbles and ships them out.', gp);
    }
    if (photo) {
      const n = multi ? 6 : 2;
      const len = multi ? 26 : 46;
      const cp = many(n, len + 4, (x, y) => chloroplast(x, y, len, rng.range(0, 180)));
      if (cp) part('Chloroplasts', '#3fae55', 'Captured blue-green bacteria, now solar panels. They turn light, water and carbon dioxide into sugar and give off oxygen.', cp);
    }
    if (chemo) {
      const sb = many(5, 14, (x, y) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rng.range(0, 180))})"><rect x="-13" y="-6" width="26" height="12" rx="6" fill="#c9a75a" stroke="#f6e05e" stroke-width="1.5"/></g>`);
      if (sb) part('Symbiotic bacteria', '#c9a75a', 'Sulfur-eating bacteria living inside the cell and feeding their host with chemistry from the vents.', sb);
    }
    mitoCount = auto ? 3 : Math.min(9, 3 + Math.round(4 * g.speed + 3 * g.intel + 3 * g.flight + (multi ? 1 : 0)));
    const mt = many(mitoCount, 24, (x, y) => mitochondrion(x, y, 22, rng.range(0, 180)));
    if (mt) {
      const life = mitoCount >= 7 ? 'a busy, oxygen-hungry way of life' : mitoCount >= 5 ? 'an active life' : 'a calm life';
      part('Mitochondria', '#d9714a', `Power plants that burn food with oxygen; they descend from bacteria swallowed long ago. This cell has ${mitoCount}, enough for ${life}. More oxygen in the air lets bodies grow bigger.`, mt);
    }
    if (!multi) {
      const cv = place(16);
      if (cv) {
        body.push(`<circle cx="${f(cv[0])}" cy="${f(cv[1])}" r="14" fill="#8fd3f0" fill-opacity="0.3" stroke="#8fd3f0" stroke-width="2"/>`);
        part('Contractile vacuole', '#8fd3f0', 'Pumps out the water that keeps leaking into a single cell living in water.', cv);
      }
    }
    if (!auto) {
      const ly = many(3, 12, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="#b55bd1" stroke="#e3a6f5" stroke-width="2"/><circle cx="${f(x - 3)}" cy="${f(y - 2)}" r="2" fill="#f3d4fb"/><circle cx="${f(x + 3)}" cy="${f(y + 3)}" r="1.6" fill="#f3d4fb"/>`);
      if (ly) part('Lysosomes', '#b55bd1', 'Bags of digestive enzymes that break down food and worn-out parts.', ly);
      if (!multi) {
        const fv = many(hunter ? 2 : 1, 22, (x, y) => {
          let s = `<circle cx="${f(x)}" cy="${f(y)}" r="20" fill="#7a5a3a" fill-opacity="0.55" stroke="#c9a27a" stroke-width="2"/>`;
          for (let i = 0; i < 4; i++) s += `<circle cx="${f(x + rng.range(-10, 10))}" cy="${f(y + rng.range(-10, 10))}" r="${f(rng.range(2, 4))}" fill="${hunter ? '#6fb3e0' : '#6fcf7a'}"/>`;
          return s;
        });
        if (fv) part('Food vacuole', '#a07a52', hunter ? 'A swallowed victim, being digested.' : 'Swallowed algae and bacteria, being digested.', fv);
      }
      const ce = place(14);
      if (ce) {
        body.push(`<g transform="translate(${f(ce[0])} ${f(ce[1])}) rotate(${f(rng.range(0, 90))})"><rect x="-9" y="-3.5" width="18" height="7" rx="2" fill="#e7e7ee" opacity="0.85"/><rect x="-3.5" y="-12" width="7" height="18" rx="2" fill="#c7c7d6" opacity="0.85"/></g>`);
        part('Centrioles', '#e7e7ee', 'Organise the scaffolding that pulls the chromosomes apart when the cell divides.', ce);
      }
    }
    if (photo && !multi) {
      const es = place(9);
      if (es) {
        body.push(`<circle cx="${f(es[0])}" cy="${f(es[1])}" r="8" fill="#ff5a4f"/>`);
        part('Eyespot', '#ff5a4f', 'A red light sensor that steers the alga towards the sun.', es);
      }
    }
  }

  if (g.toxin > 0.25) {
    const tx = many(Math.round(2 + g.toxin * 7), 7, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="#ef6461" stroke="#ffb3b1" stroke-width="1.5"/>`);
    if (tx) part('Toxin vesicles', '#ef6461', `Store this species’ poison (toxin ${pct(g.toxin)}), which makes it a bad meal.`, tx);
  }

  // ribosomes everywhere
  let ribo = '';
  for (let i = 0; i < 70; i++) {
    const x = CX + rng.range(-230, 230);
    const y = CY + rng.range(-160, 160);
    if (!shape.inside(x, y, 8) || occupied.some((o) => Math.hypot(o.x - x, o.y - y) < o.r)) continue;
    ribo += `<circle cx="${f(x)}" cy="${f(y)}" r="2.3" fill="#cfd8f3" opacity="0.65"/>`;
  }
  body.push(ribo);
  part('Ribosomes', '#cfd8f3', 'Tiny factories that build proteins from the genetic recipe.');

  // appendages
  if (prok) {
    if (!auto || g.speed > 0.1 || chemo) {
      outside.push(flagellum(shape, 0.25, 125));
      part('Flagellum', '#dbe4f5', 'A spinning whip for swimming towards food and away from trouble.', edgePoint(shape, 0.25));
    }
    for (let i = 0; i < 16; i++) {
      const th = rng.range(0, 6.28);
      const [ex, ey] = edgePoint(shape, th);
      outside.push(`<line x1="${f(ex)}" y1="${f(ey)}" x2="${f(ex + Math.cos(th) * 15)}" y2="${f(ey + Math.sin(th) * 15)}" stroke="#c9a75a" stroke-width="1.6" opacity="0.6"/>`);
    }
    part('Pili', '#c9a75a', 'Hair-like grapples for clinging to rock and to each other.');
  } else if (!multi) {
    if (photo) {
      outside.push(flagellum(shape, -Math.PI / 2 - 0.25, 115), flagellum(shape, -Math.PI / 2 + 0.25, 115));
      part('Flagella', '#dbe4f5', 'Two beating whips that pull the alga through the water.', edgePoint(shape, -Math.PI / 2 - 0.25));
    } else if (g.diet === 'herb') {
      for (let i = 0; i < 46; i++) {
        const th = (i / 46) * Math.PI * 2;
        const [ex, ey] = edgePoint(shape, th);
        const x2 = ex + Math.cos(th) * 14;
        const y2 = ey + Math.sin(th) * 14;
        outside.push(`<line x1="${f(ex)}" y1="${f(ey)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#dbe4f5" stroke-width="1.8" stroke-linecap="round" opacity="0.75"><animateTransform attributeName="transform" type="rotate" values="-18 ${f(ex)} ${f(ey)};18 ${f(ex)} ${f(ey)};-18 ${f(ex)} ${f(ey)}" dur="0.8s" begin="${f(i * 0.035)}s" repeatCount="indefinite"/></line>`);
      }
      part('Cilia', '#dbe4f5', 'Hundreds of tiny beating hairs for swimming and sweeping food into the cell.', edgePoint(shape, -2.4));
    } else if (hunter) {
      part('Pseudopods', '#f0c7d8', 'The cell flows forward on these arms and wraps around its prey to swallow it.', edgePoint(shape, 0.35));
      if (g.speed > 0.2) outside.push(flagellum(shape, Math.PI, 110));
    }
  }

  // wall and membrane
  const wall = prok || plantLike;
  const wallColor = prok ? '#c9a75a' : '#7bc47f';
  const memColor = wall ? '#e8d9b0' : '#f0c7d8';
  if (wall) {
    part(prok ? 'Cell wall' : 'Cellulose wall', wallColor, prok ? 'A tough coat that holds the cell’s shape and keeps it from bursting.' : 'Stiff cellulose: every cell becomes a brick, so plants can stand upright and grow tall.', edgePoint(shape, -2.35));
  }
  const memAt = edgePoint(shape, 2.45);
  part('Cell membrane', memColor, 'A thin oily skin that decides what gets in and out.', [CX + (memAt[0] - CX) * (wall ? 0.955 : 1), CY + (memAt[1] - CY) * (wall ? 0.955 : 1)]);

  // neighbouring cells of a many-celled body
  let neighbours = '';
  if (multi) {
    const offs = plantLike
      ? [
          [-410, 0],
          [410, 0],
          [0, -306],
          [0, 306],
          [-410, -306],
          [410, 306],
        ]
      : [
          [-392, -30],
          [395, 40],
          [-30, -292],
          [25, 296],
          [-370, 290],
          [380, -282],
        ];
    for (const [dx, dy] of offs) {
      neighbours += `<g transform="translate(${dx} ${dy})" opacity="0.26"><path d="${shape.path}" fill="${cyto[0]}" stroke="${wall ? wallColor : memColor}" stroke-width="${wall ? 14 : 4}"/><circle cx="${CX}" cy="${CY}" r="34" fill="#5b4b9a"/></g>`;
    }
    if (plantLike) {
      for (const y of [-70, 10, 90]) neighbours += `<line x1="${CX + 190}" x2="${CX + 212}" y1="${CY + y}" y2="${CY + y}" stroke="#e8d9b0" stroke-width="2.5"/><line x1="${CX - 212}" x2="${CX - 190}" y1="${CY + y - 30}" y2="${CY + y - 30}" stroke="#e8d9b0" stroke-width="2.5"/>`;
      part('Plasmodesmata', '#e8d9b0', 'Channels through the wall that link each plant cell to its neighbours.');
    }
  }

  // the outline itself
  let outline = '';
  if (prok) outline += `<path d="${shape.path}" fill="none" stroke="${wallColor}" stroke-opacity="0.16" stroke-width="26"/>`;
  outline += `<path d="${shape.path}" fill="url(#cyto)" stroke="${wall ? wallColor : memColor}" stroke-width="${wall ? (prok ? 9 : 14) : 4}"/>`;
  const inner = wall ? `<path d="${shape.path}" transform="translate(${CX} ${CY}) scale(0.955) translate(${-CX} ${-CY})" fill="none" stroke="${memColor}" stroke-width="2.5" opacity="0.85"/>` : '';

  const svg = `<svg viewBox="0 0 760 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Drawing of the cell">
    <defs><radialGradient id="cyto" cx="45%" cy="40%" r="70%"><stop offset="0%" stop-color="${cyto[0]}"/><stop offset="100%" stop-color="${cyto[1]}"/></radialGradient></defs>
    <style>.cl{font:13px "Segoe UI",system-ui,sans-serif;fill:#dbe4f5;paint-order:stroke;stroke:#080c18;stroke-width:4px;stroke-linejoin:round}</style>
    ${neighbours}${outside.join('')}${outline}${inner}${body.join('')}${layoutLabels(labels)}
  </svg>`;

  // words
  const cells = massKg(g.size) / 1e-12;
  let title: string;
  let subtitle: string;
  let intro: string;
  if (prok) {
    title = 'Prokaryotic cell';
    subtitle = 'about 2 µm long';
    intro = photo
      ? 'One of the first sun-eaters: a tiny bag of chemistry with its DNA floating free. Billions of these are what first poured oxygen into the air.'
      : chemo
        ? 'Life at its simplest: a tiny bag of chemistry with its DNA floating free, living off minerals from the hot vents in total darkness.'
        : 'A tiny bag of chemistry with its DNA floating free. It makes no food of its own; it lives by eating other microbes.';
  } else if (!multi) {
    title = 'Single eukaryotic cell';
    subtitle = 'about 20 µm across';
    intro = photo
      ? 'A single complex cell. Long ago its ancestor swallowed a sun-eating bacterium and never digested it: that captive became the chloroplast.'
      : 'A single complex cell that grazes or hunts. It swallows its food whole and digests it inside, powered by mitochondria that were once free-living bacteria.';
  } else if (plantLike) {
    title = g.habitat === 'aquatic' ? 'Seaweed cell' : 'Plant cell';
    subtitle = `about 50 µm · one of roughly ${fmtBig(cells)} cells`;
    intro = 'One of the countless cells that build this plant. A stiff wall around every cell turns the plant into a building of bricks, which is how it can stand up and race its rivals for the light.';
  } else {
    title = 'Animal cell';
    subtitle = `about 20 µm · one of roughly ${fmtBig(cells)} cells`;
    intro = 'One of the countless cells that build this animal. With no stiff wall, animal cells can change shape, crawl, contract and specialise into muscle, nerve, skin and bone.';
  }

  return { svg, title, subtitle, intro, parts, tissues: cellTypes(g, plantLike) };
}

/** Labels in two columns beside the drawing, with leader lines to their part. */
function layoutLabels(labels: { x: number; y: number; text: string }[]): string {
  let s = '';
  const sides: [typeof labels, boolean][] = [
    [labels.filter((l) => l.x < CX).sort((a, b) => a.y - b.y), true],
    [labels.filter((l) => l.x >= CX).sort((a, b) => a.y - b.y), false],
  ];
  for (const [list, left] of sides) {
    const X = left ? 150 : 610;
    const ys = list.map((l) => l.y);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + 24 : 18);
    for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === ys.length - 1 ? 425 : ys[i + 1] - 24);
    list.forEach((l, i) => {
      const y = ys[i];
      const ex = left ? X + 10 : X - 10;
      s += `<path d="M${f(l.x)},${f(l.y)} L${ex},${f(y)} L${X},${f(y)}" fill="none" stroke="#dbe4f5" stroke-opacity="0.55" stroke-width="1.2"/><circle cx="${f(l.x)}" cy="${f(l.y)}" r="3" fill="#fff"/>`;
      s += `<text class="cl" x="${left ? X - 4 : X + 4}" y="${f(y + 4.5)}" text-anchor="${left ? 'end' : 'start'}">${l.text}</text>`;
    });
  }
  return s;
}

/** The specialised cells a many-celled body is built from, as this genome would need them. */
function cellTypes(g: Genome, plantLike: boolean): CellType[] {
  const out: CellType[] = [];
  if (g.tier < 2) return out;
  const land = g.habitat !== 'aquatic';
  if (plantLike) {
    out.push({ icon: '🍃', name: land ? 'Leaf cells' : 'Blade cells', desc: 'Packed with chloroplasts: the green factories that make food and oxygen.' });
    if (land) {
      out.push({ icon: '🌱', name: 'Root hair cells', desc: 'Long thin cells that drink water and minerals from the soil. Rich soil means faster growth.' });
      out.push({ icon: '💨', name: 'Guard cells', desc: 'Pairs that open and close the pores in the leaves, trading water for carbon dioxide. This is why drought hurts.' });
    } else out.push({ icon: '⚓', name: 'Holdfast', desc: 'Grips the rock so the waves cannot tear the plant away.' });
    if (g.tier >= 3 && land) out.push({ icon: '🚰', name: 'Xylem and phloem', desc: 'Pipes of hollow cells that lift water up and carry sugar down. They are what let plants grow tall.' });
    if (g.size > 5 || g.armor > 0.3) out.push({ icon: '🪵', name: 'Wood and bark', desc: `Dead cells with thick, hardened walls: height to win the race for light${g.armor > 0.3 ? ', and armour against grazers' : ''}.` });
    if (g.toxin > 0.25) out.push({ icon: '☠️', name: 'Toxin cells', desc: `Store bitter poisons that put grazers off (toxin ${pct(g.toxin)}).` });
    if (g.tier >= 4 && land) out.push({ icon: '🌸', name: 'Flowers and pollen', desc: 'Sex cells carried by wind and animals to other plants.' });
    else out.push({ icon: '🫧', name: 'Spores', desc: 'Tough single cells that drift away to start new plants.' });
    return out;
  }
  const sponge = g.tier === 2 && !land && g.diet === 'herb' && g.speed < 0.12;
  if (sponge) out.push({ icon: '🧽', name: 'Collar cells', desc: 'Each beats a little whip to pump water through the body and filter out food.' });
  out.push({
    icon: '🍽️',
    name: 'Gut cells',
    desc: g.diet === 'carn' ? 'Line the gut and digest meat.' : g.diet === 'herb' ? 'Line the gut and digest plants, with help from microbes living inside.' : 'Line the gut and digest whatever comes along.',
  });
  out.push({ icon: '💪', name: 'Muscle cells', desc: `Contract to move the body.${g.speed > 0.4 ? ' Plenty of them here: this is a fast mover.' : ''}` });
  if (g.tier >= 4) {
    out.push({
      icon: '🧠',
      name: 'Nerve cells and brain',
      desc: g.intel > 0.5 ? `A large brain of densely wired neurons (intelligence ${pct(g.intel)}). Expensive to run, but it plans, remembers and learns.` : 'A central brain and a nerve cord running along the backbone.',
    });
  } else {
    out.push({ icon: '🕸️', name: g.tier === 2 ? 'Nerve net' : 'Nerve cords', desc: g.tier === 2 ? 'A simple web of nerve cells. No brain yet.' : 'Bundles of nerves and a small brain behind the eyes.' });
  }
  if (g.tier >= 3) out.push({ icon: '👁️', name: 'Light-sensing cells', desc: 'Gathered into eyes that spot food and danger.' });
  if (!land) out.push({ icon: '🫧', name: 'Gill cells', desc: 'Thin walls that take oxygen from the water.' });
  else if (g.tier >= 4) out.push({ icon: '🫁', name: 'Lung cells', desc: 'Take oxygen from the air. More oxygen in the air allows bigger bodies.' });
  else out.push({ icon: '🫁', name: 'Breathing tubes', desc: 'Tiny air pipes reaching every cell, which is why crawlers can only get so big.' });
  if (g.armor > 0.3) out.push({ icon: '🛡️', name: g.tier >= 4 ? 'Bone and scale cells' : 'Shell-building cells', desc: 'Lay down minerals into hard plates.' });
  if (g.horns > 0.3) out.push({ icon: '🦌', name: 'Horn cells', desc: 'Pile up hard keratin over a core of bone.' });
  if (g.fur > 0.3) out.push({ icon: '🧥', name: 'Hair follicles', desc: 'Grow fur or feathers that keep the warmth in.' });
  if (g.toxin > 0.25) out.push({ icon: '☠️', name: g.tier === 2 ? 'Stinging cells' : 'Venom glands', desc: g.tier === 2 ? 'Fire tiny poisoned harpoons at prey and attackers.' : 'Brew venom to subdue prey or punish predators.' });
  if (g.flight > 0.3) out.push({ icon: '🪽', name: 'Flight muscles', desc: 'Crammed with mitochondria to power the wings.' });
  if (g.immunity > 0.3) out.push({ icon: '🩸', name: 'Immune cells', desc: 'Patrol the body and hunt down viruses. Why the survivors of a plague come back stronger.' });
  out.push({ icon: '🥚', name: 'Egg and sperm cells', desc: 'Carry the genes to the next generation, shuffled: the raw material of evolution.' });
  return out;
}

const BASE: Genome = {
  tier: 0,
  diet: 'chemo',
  habitat: 'aquatic',
  size: 0.2,
  tempOpt: 20,
  tempTol: 10,
  phOpt: 7,
  phTol: 1,
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
};

/** Textbook cells to compare with. */
export const CELL_EXAMPLES: { id: string; name: string; icon: string; desc: string; genome: Genome }[] = [
  { id: 'vent', name: 'Vent microbe', icon: '🦠', desc: 'The first life in your world', genome: { ...BASE } },
  { id: 'cyano', name: 'Blue-green bacterium', icon: '🦠', desc: 'The first sun-eater', genome: { ...BASE, diet: 'photo' } },
  { id: 'alga', name: 'Single-celled alga', icon: '🟢', desc: 'A complex cell with chloroplasts', genome: { ...BASE, tier: 1, diet: 'photo', size: 1 } },
  { id: 'amoeba', name: 'Amoeba', icon: '🧫', desc: 'A single-celled hunter', genome: { ...BASE, tier: 1, diet: 'omni', size: 1.2 } },
  { id: 'tree', name: 'Tree', icon: '🌳', desc: 'A cell from a broadleaf tree', genome: { ...BASE, tier: 4, diet: 'photo', habitat: 'terrestrial', size: 7.5, armor: 0.4 } },
  { id: 'grazer', name: 'Horned grazer', icon: '🐂', desc: 'A cell from a big savanna mammal', genome: { ...BASE, tier: 4, diet: 'herb', habitat: 'terrestrial', size: 7.5, speed: 0.6, horns: 0.7, fur: 0.5, social: 0.6, immunity: 0.4 } },
];
