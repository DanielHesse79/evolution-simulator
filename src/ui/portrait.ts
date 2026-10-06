import { SENTIENCE, hasHumanoidBody, isAuto, type Genome } from '../sim/genome';
import { RNG } from '../sim/rng';

/**
 * A painted portrait of a species, generated from its genome. The body plan follows the same rules
 * as the species description (fish, insect, grazer, conifer, kelp...), and the traits show: horns
 * grow with the horn gene, fur makes the outline shaggy, poison brings warning colours, a social
 * species is shown in company, and so on. Each species gets its own colours and proportions.
 */

const f = (v: number) => v.toFixed(1);
let uid = 0;

interface Pal {
  hue: number;
  body: string;
  dark: string;
  light: string;
  belly: string;
  mark: string;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${f(((h % 360) + 360) % 360)},${f(s)}%,${f(l)}%,${a})`;

function palette(g: Genome, hue: number, rng: RNG): Pal {
  const toxic = g.toxin > 0.5;
  const sat = toxic ? 80 : 30 + rng.range(0, 25);
  const l = toxic ? 52 : 40 + rng.range(0, 14);
  return {
    hue,
    body: hsl(hue, sat, l),
    dark: hsl(hue, sat, l - 20),
    light: hsl(hue, sat * 0.8, l + 18),
    belly: hsl(hue + 20, sat * 0.6, l + 26),
    mark: toxic ? (rng.chance(0.5) ? '#16161c' : '#ffd23f') : hsl(hue, sat, l - 28, 0.8),
  };
}

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

function sky(id: string, g: Genome): string {
  const cold = g.tempOpt < 2;
  const hot = g.tempOpt > 24;
  const top = cold ? '#9fb6cf' : hot ? '#e6b97a' : '#86b8e0';
  const low = cold ? '#e3ecf5' : hot ? '#f6dfb0' : '#cfe6f4';
  return `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient>`;
}

function landScene(id: string, g: Genome, rng: RNG): string {
  const snow = g.tempOpt < -2;
  const dry = g.moistOpt < 0.32;
  const ground = snow ? '#e8eef4' : dry ? '#d2b67a' : g.moistOpt > 0.7 ? '#4f8a3c' : '#7aa64a';
  const far = snow ? '#c9d6e3' : dry ? '#c4a56a' : '#6a9a52';
  let s = `<defs>${sky(id, g)}</defs><rect width="200" height="150" fill="url(#${id}s)"/>`;
  // distant hills
  s += `<path d="M0,104 Q40,${f(84 + rng.range(-6, 6))} 80,100 T160,96 T200,100 V150 H0Z" fill="${far}" opacity="0.7"/>`;
  s += `<rect y="118" width="200" height="32" fill="${ground}"/>`;
  if (!snow && !dry) {
    for (let i = 0; i < 9; i++) {
      const x = rng.range(5, 195);
      const y = rng.range(124, 146);
      s += `<path d="M${f(x)},${f(y)} l-2,-5 M${f(x)},${f(y)} l0,-6 M${f(x)},${f(y)} l2,-5" stroke="#3d6e2c" stroke-width="1" opacity="0.6"/>`;
    }
  }
  return s;
}

function waterScene(id: string, floor: boolean, rng: RNG): string {
  let s = `<defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f8fb8"/><stop offset="1" stop-color="#0d3150"/></linearGradient></defs><rect width="200" height="150" fill="url(#${id}w)"/>`;
  for (let i = 0; i < 4; i++) {
    const x = rng.range(20, 180);
    s += `<path d="M${f(x)},0 L${f(x - 25)},150 L${f(x - 5)},150 L${f(x + 12)},0Z" fill="#ffffff" opacity="0.05"/>`;
  }
  for (let i = 0; i < 6; i++) s += `<circle cx="${f(rng.range(10, 190))}" cy="${f(rng.range(10, 130))}" r="${f(rng.range(1, 3))}" fill="none" stroke="#cfeaff" stroke-width="0.8" opacity="0.5"/>`;
  if (floor) s += `<path d="M0,134 Q50,126 100,132 T200,130 V150 H0Z" fill="#c2a878"/><path d="M0,140 Q60,134 120,140 T200,138 V150 H0Z" fill="#a88f62"/>`;
  return s;
}

function shoreScene(id: string, g: Genome, rng: RNG): string {
  let s = landScene(id, g, rng);
  s += `<path d="M0,112 Q60,108 110,116 L110,150 H0Z" fill="#3c86b0"/><path d="M0,112 Q60,108 110,116" stroke="#d9f0ff" stroke-width="1.5" fill="none" opacity="0.7"/>`;
  return s;
}

function lens(id: string, inner: string): string {
  return `<defs><radialGradient id="${id}l" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#2d5a63"/><stop offset="1" stop-color="#0c1d24"/></radialGradient><clipPath id="${id}c"><circle cx="100" cy="75" r="68"/></clipPath></defs>
    <rect width="200" height="150" fill="#05070d"/><circle cx="100" cy="75" r="68" fill="url(#${id}l)"/><g clip-path="url(#${id}c)">${inner}</g>
    <circle cx="100" cy="75" r="68" fill="none" stroke="#2a3346" stroke-width="5"/><circle cx="100" cy="75" r="72" fill="none" stroke="#0f1420" stroke-width="4"/>`;
}

// ---------------------------------------------------------------------------
// microbes
// ---------------------------------------------------------------------------

function microbe(g: Genome, P: Pal, rng: RNG, id: string): string {
  let s = '';
  // specks of debris in the water
  for (let i = 0; i < 18; i++) s += `<circle cx="${f(rng.range(32, 168))}" cy="${f(rng.range(10, 140))}" r="${f(rng.range(0.5, 1.5))}" fill="#9fd" opacity="0.25"/>`;
  if (g.tier === 0) {
    const shape = rng.int(3); // rod, sphere, spiral
    const fill = g.diet === 'photo' ? hsl(150, 50, 42) : P.body;
    for (let i = 0; i < 5; i++) {
      const x = rng.range(55, 145);
      const y = rng.range(35, 115);
      const a = rng.range(0, 180);
      let cell: string;
      if (shape === 0) cell = `<rect x="-17" y="-7" width="34" height="14" rx="7" fill="${fill}" stroke="${P.light}" stroke-width="1.5"/>`;
      else if (shape === 1) cell = `<circle r="9" fill="${fill}" stroke="${P.light}" stroke-width="1.5"/>`;
      else cell = `<path d="M-18,0 q4.5,-8 9,0 t9,0 t9,0 t9,0" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`;
      let extra = '';
      if (g.diet === 'photo' && shape !== 2) extra += `<path d="M-10,-2 H10 M-10,2 H10" stroke="#a6e3a1" stroke-width="1" opacity="0.8"/>`;
      if (g.diet === 'chemo' && shape !== 2) extra += `<circle cx="-5" cy="0" r="2" fill="#f6e05e"/><circle cx="5" cy="1" r="1.6" fill="#f6e05e"/>`;
      if (g.diet !== 'photo' && i % 2 === 0) extra += `<path d="M17,0 q6,-5 12,0 t12,0" fill="none" stroke="${P.light}" stroke-width="1" opacity="0.8"/>`;
      s += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">${cell}${extra}</g>`;
    }
  } else if (g.diet === 'photo') {
    // a single green alga with its eyespot and two whips
    s += `<path d="M100,40 q-20,-20 -30,-30 M100,40 q20,-20 30,-30" stroke="#d6eadf" stroke-width="1.5" fill="none"/>`;
    s += `<ellipse cx="100" cy="78" rx="34" ry="40" fill="${hsl(120, 45, 38)}" stroke="#bfe8b4" stroke-width="2.5"/>`;
    s += `<path d="M76,90 Q100,128 124,90 Q122,60 100,56 Q78,60 76,90Z" fill="${hsl(120, 55, 30)}"/>`;
    s += `<circle cx="100" cy="70" r="10" fill="#6a5aa8"/><circle cx="116" cy="52" r="4" fill="#ff5a4f"/>`;
  } else {
    const hunter = g.diet === 'carn' || g.diet === 'omni';
    let d: string;
    if (hunter) {
      const pts: string[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 34 + (i % 3 === 0 ? 16 : 0) + rng.range(-4, 4);
        pts.push(`${f(100 + Math.cos(a) * r)},${f(75 + Math.sin(a) * r * 0.85)}`);
      }
      d = `M${pts.join(' L')}Z`;
    } else d = 'M66,75 C66,40 134,40 134,75 C134,110 66,110 66,75Z';
    if (!hunter) for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const x = 100 + Math.cos(a) * 35;
      const y = 75 + Math.sin(a) * 28;
      s += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.cos(a) * 6)}" y2="${f(y + Math.sin(a) * 6)}" stroke="${P.light}" stroke-width="1"/>`;
    }
    s += `<path d="${d}" fill="${P.body}" fill-opacity="0.75" stroke="${P.light}" stroke-width="2" stroke-linejoin="round"/>`;
    s += `<circle cx="96" cy="72" r="10" fill="${P.dark}"/><circle cx="114" cy="84" r="7" fill="#7a5a3a" opacity="0.7"/><circle cx="84" cy="86" r="5" fill="#9fd8f0" opacity="0.5"/>`;
  }
  return lens(id, s);
}

// ---------------------------------------------------------------------------
// plants
// ---------------------------------------------------------------------------

function leafColor(g: Genome, hue: number, rng: RNG, dl = 0): string {
  const h = Math.min(150, Math.max(70, hue));
  const l = (g.moistOpt < 0.35 ? 42 : 32) + dl + rng.range(-3, 3);
  return hsl(h, g.moistOpt < 0.35 ? 30 : 48, l);
}

function berries(x: number, y: number, n: number, rng: RNG, r = 2.6): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(x + rng.range(-14, 14))}" cy="${f(y + rng.range(-10, 10))}" r="${r}" fill="#d9283a" stroke="#ffb3b1" stroke-width="0.6"/>`;
  return s;
}

function plant(g: Genome, P: Pal, rng: RNG, id: string): string {
  const aquatic = g.habitat === 'aquatic';
  const toxic = g.toxin > 0.45;
  const thorny = g.armor > 0.45;
  const leaf = leafColor(g, P.hue, rng);
  const leafDark = leafColor(g, P.hue, rng, -10);
  const trunk = g.armor > 0.4 ? '#5a3d28' : '#6e4b30';
  let s = '';

  if (aquatic) {
    s = waterScene(id, true, rng);
    if (g.size > 3) {
      // kelp: fronds rising from a holdfast, buoyed by little gas bladders
      const h = g.tier >= 3 ? 120 : 95;
      for (let i = 0; i < 4; i++) {
        const x0 = 85 + i * 9;
        const sway = rng.range(-14, 14);
        s += `<path d="M${x0},134 C${f(x0 + sway)},${f(134 - h * 0.4)} ${f(x0 - sway)},${f(134 - h * 0.7)} ${f(x0 + sway * 0.5)},${f(134 - h)}" stroke="${hsl(45 + rng.range(-8, 8), 55, 30)}" stroke-width="2" fill="none"/>`;
        for (let j = 1; j < 6; j++) {
          const y = 134 - (h * j) / 6;
          const x = x0 + Math.sin(j) * sway * 0.4;
          const dir = j % 2 ? 1 : -1;
          s += `<path d="M${f(x)},${f(y)} q${dir * 16},-6 ${dir * 22},4 q-${dir * 10},2 -${dir * 22},-4Z" fill="${hsl(55, 50, 34)}" opacity="0.9"/><circle cx="${f(x)}" cy="${f(y)}" r="2" fill="${hsl(50, 60, 45)}"/>`;
        }
      }
      s += `<ellipse cx="98" cy="135" rx="18" ry="5" fill="#4a3b25"/>`;
    } else if (g.tier >= 4) {
      // a flowering water plant: lily pads on the surface
      s += `<rect width="200" height="34" fill="#4a9cc4" opacity="0.6"/>`;
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 38 + rng.range(-6, 6);
        s += `<path d="M${x},134 Q${x + 5},80 ${x},34" stroke="${leafDark}" stroke-width="1.5" fill="none"/><ellipse cx="${x}" cy="32" rx="18" ry="5" fill="${leaf}"/>`;
      }
      s += `<g transform="translate(100 24)">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="4" ry="9" transform="rotate(${a}) translate(0 -6)" fill="${hsl(P.hue + 200, 60, 80)}"/>`).join('')}<circle r="3.5" fill="#f2c14e"/></g>`;
    } else if (g.tier === 3) {
      for (let i = 0; i < 22; i++) {
        const x = 30 + i * 6.5 + rng.range(-2, 2);
        const h = rng.range(40, 85);
        s += `<path d="M${f(x)},136 q${f(rng.range(-8, 8))},-${f(h / 2)} ${f(rng.range(-10, 10))},-${f(h)}" stroke="${i % 2 ? leaf : leafDark}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      }
    } else {
      // algal mat over the rocks
      s += `<path d="M30,136 Q50,112 80,120 Q100,104 130,118 Q160,110 175,136Z" fill="#6c6a66"/>`;
      for (let i = 0; i < 70; i++) s += `<circle cx="${f(rng.range(36, 170))}" cy="${f(rng.range(110, 134))}" r="${f(rng.range(2, 5))}" fill="${i % 2 ? leaf : leafDark}" opacity="0.9"/>`;
    }
    // poisonous seaweed shows it with a sickly tint rather than berries
    if (toxic) s += `<rect width="200" height="150" fill="#b0306a" opacity="0.08"/>`;
    return s;
  }

  s = g.habitat === 'amphibious' ? shoreScene(id, g, rng) : landScene(id, g, rng);
  const ground = 120;

  if (g.tier === 2) {
    if (g.moistOpt < 0.35) {
      // lichen on a boulder
      s += `<path d="M45,${ground} Q50,70 100,68 Q150,70 158,${ground}Z" fill="#8a8a86"/><path d="M60,${ground} Q70,82 100,80" stroke="#6e6e6a" stroke-width="2" fill="none"/>`;
      for (let i = 0; i < 14; i++) {
        const x = rng.range(58, 145);
        const y = rng.range(76, 114);
        const r = rng.range(5, 11);
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${i % 3 ? hsl(55 + rng.range(-20, 40), 45, 55) : hsl(25, 60, 50)}" stroke="${hsl(50, 30, 35)}" stroke-width="1" stroke-dasharray="2 1.5"/>`;
      }
    } else {
      // a cushion of moss with spore capsules on fine stalks
      s += `<ellipse cx="100" cy="${ground}" rx="70" ry="26" fill="${leafDark}"/>`;
      for (let i = 0; i < 110; i++) {
        const a = rng.range(Math.PI, Math.PI * 2);
        const r = Math.sqrt(rng.next());
        s += `<circle cx="${f(100 + Math.cos(a) * 66 * r)}" cy="${f(ground + Math.sin(a) * 24 * r)}" r="${f(rng.range(1.5, 3))}" fill="${i % 2 ? leaf : leafDark}"/>`;
      }
      for (let i = 0; i < 12; i++) {
        const x = rng.range(50, 150);
        const y = ground - rng.range(8, 20);
        s += `<path d="M${f(x)},${f(y + 10)} l0,-14" stroke="#9a7a3a" stroke-width="0.8"/><ellipse cx="${f(x)}" cy="${f(y - 5)}" rx="1.6" ry="3" fill="#8a5a2a"/>`;
      }
    }
    if (toxic) s += berries(100, ground - 14, 4, rng, 2);
    return s;
  }

  if (g.tier === 3) {
    if (g.size >= 5.2) {
      // tree fern: a slender trunk and a crown of arching fronds
      s += `<path d="M98,${ground} L100,48 L104,48 L106,${ground}Z" fill="${trunk}"/>`;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI + (i / 8) * Math.PI;
        const ex = 102 + Math.cos(a) * 52;
        const ey = 46 + Math.sin(a) * 26 + 14;
        s += frond(102, 46, ex, ey, leaf, 10);
      }
    } else if (g.size >= 3) {
      // horsetails: jointed stems with whorls of needles
      for (let i = 0; i < 7; i++) {
        const x = 55 + i * 15 + rng.range(-4, 4);
        const h = rng.range(55, 85);
        s += `<line x1="${f(x)}" y1="${ground}" x2="${f(x)}" y2="${f(ground - h)}" stroke="${leaf}" stroke-width="3.5"/>`;
        for (let y = ground - 10; y > ground - h; y -= 9) s += `<line x1="${f(x - 3)}" y1="${f(y)}" x2="${f(x + 3)}" y2="${f(y)}" stroke="${leafDark}" stroke-width="1.5"/><path d="M${f(x)},${f(y)} l-9,7 M${f(x)},${f(y)} l9,7" stroke="${leaf}" stroke-width="0.8"/>`;
        s += `<ellipse cx="${f(x)}" cy="${f(ground - h - 4)}" rx="2.5" ry="5" fill="#8a6a3a"/>`;
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + 0.25 + (i / 6) * (Math.PI - 0.5);
        s += frond(100, ground, 100 + Math.cos(a) * 62, ground - 10 + Math.sin(a) * 58, i % 2 ? leaf : leafDark, 12);
      }
    }
    if (thorny && g.size < 5.2) s += thorns(100, ground - 30, rng);
    if (toxic) s += g.size >= 5.2 ? berries(102, 52, 5, rng) : berries(100, ground - 30, 5, rng);
    return s;
  }

  // flowering plants
  if (g.size < 3 && g.moistOpt < 0.72) {
    // grass: tufts of blades with nodding seed heads
    for (const [cx, sc] of [
      [100, 1],
      [52, 0.65],
      [150, 0.7],
    ] as [number, number][]) {
      const straw = g.moistOpt < 0.4;
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + rng.range(-0.75, 0.75);
        const len = rng.range(40, 78) * sc;
        const ex = cx + Math.cos(a) * len;
        const ey = ground + Math.sin(a) * len;
        const col = straw ? hsl(45 + rng.range(-6, 6), 50, 55 + rng.range(-8, 8)) : i % 3 ? leaf : leafDark;
        s += `<path d="M${cx},${ground} Q${f(cx + (ex - cx) * 0.3)},${f(ground - len * 0.6)} ${f(ex)},${f(ey)}" stroke="${col}" stroke-width="${f(2.2 * sc)}" fill="none" stroke-linecap="round"/>`;
        if (i % 4 === 0) s += `<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(2.2 * sc)}" ry="${f(6 * sc)}" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(ex)} ${f(ey)})" fill="${hsl(42, 55, 62)}"/>`;
      }
    }
    if (toxic) s += berries(100, ground - 20, 3, rng, 2);
    return s;
  }
  if (g.size < 3) {
    // a flowering herb
    const petal = toxic ? '#d9283a' : hsl(P.hue + 160 + rng.range(-40, 40), 70, 70);
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 20 + rng.range(-5, 5);
      const h = rng.range(45, 75);
      s += `<path d="M${f(x)},${ground} q${f(rng.range(-6, 6))},-${f(h / 2)} 0,-${f(h)}" stroke="${leafDark}" stroke-width="2" fill="none"/>`;
      s += `<ellipse cx="${f(x - 7)}" cy="${f(ground - h * 0.4)}" rx="7" ry="3" fill="${leaf}" transform="rotate(-25 ${f(x - 7)} ${f(ground - h * 0.4)})"/><ellipse cx="${f(x + 7)}" cy="${f(ground - h * 0.55)}" rx="7" ry="3" fill="${leaf}" transform="rotate(25 ${f(x + 7)} ${f(ground - h * 0.55)})"/>`;
      s += `<g transform="translate(${f(x)} ${f(ground - h)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="3.5" ry="7" transform="rotate(${a}) translate(0 -5)" fill="${petal}"/>`).join('')}<circle r="3" fill="#f2c14e"/></g>`;
    }
    return s;
  }
  if (g.size < 5.2) {
    if (g.moistOpt < 0.3) {
      // a desert succulent: ribbed columns with spines
      const col = hsl(110, 30, 38);
      s += `<rect x="90" y="40" width="22" height="${ground - 40}" rx="11" fill="${col}"/>`;
      s += `<path d="M90,85 h-14 a8,8 0 0 1 -8,-8 v-20 a6,6 0 0 1 12,0 v14 h10Z" fill="${col}"/><path d="M112,75 h12 a8,8 0 0 0 8,-8 v-14 a6,6 0 0 0 -12,0 v10 h-8Z" fill="${col}"/>`;
      for (let y = 46; y < ground; y += 7) s += `<line x1="96" y1="${y}" x2="96" y2="${y + 4}" stroke="#2a4a28" stroke-width="1"/><line x1="106" y1="${y + 3}" x2="106" y2="${y + 7}" stroke="#2a4a28" stroke-width="1"/>`;
      if (toxic || g.tier >= 4) s += `<circle cx="101" cy="38" r="5" fill="${toxic ? '#d9283a' : '#f29ec8'}"/>`;
      return s;
    }
    // a shrub
    for (let i = 0; i < 9; i++) {
      const x = 100 + rng.range(-38, 38);
      const y = ground - 22 - rng.range(0, 34);
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rng.range(14, 22))}" fill="${i % 2 ? leaf : leafDark}"/>`;
    }
    if (thorny) s += thorns(100, ground - 40, rng);
    if (toxic) s += berries(100, ground - 40, 8, rng);
    return s;
  }
  // trees
  const tall = 40 + Math.min(1, (g.size - 5) / 5) * 55;
  if (g.tempOpt < 9) {
    // conifer: tiers of needles, snow-dusted in the cold
    s += `<rect x="96" y="${f(ground - 18)}" width="8" height="18" fill="${trunk}"/>`;
    const top = ground - 18 - tall;
    for (let i = 0; i < 5; i++) {
      const y0 = top + (i * tall) / 5;
      const w = 12 + i * 9;
      s += `<path d="M100,${f(y0)} L${f(100 + w)},${f(y0 + tall / 3.2)} L${f(100 - w)},${f(y0 + tall / 3.2)}Z" fill="${i % 2 ? leaf : leafDark}"/>`;
      if (g.tempOpt < 0) s += `<path d="M100,${f(y0)} L${f(100 + w * 0.5)},${f(y0 + tall / 7)} L${f(100 - w * 0.5)},${f(y0 + tall / 7)}Z" fill="#f2f6fa" opacity="0.85"/>`;
    }
  } else {
    const jungle = g.tempOpt > 21 && g.moistOpt > 0.66;
    const crownY = ground - tall;
    s += `<path d="M94,${ground} L97,${f(crownY + 10)} L103,${f(crownY + 10)} L106,${ground}Z" fill="${trunk}"/>`;
    s += `<path d="M97,${f(crownY + 40)} L80,${f(crownY + 18)} M103,${f(crownY + 30)} L122,${f(crownY + 12)}" stroke="${trunk}" stroke-width="3"/>`;
    if (jungle) {
      s += `<path d="M94,${ground} q-10,0 -14,4 M106,${ground} q10,0 14,4" stroke="${trunk}" stroke-width="3" fill="none"/>`;
      for (let i = 0; i < 4; i++) s += `<path d="M${f(80 + i * 12)},${f(crownY + 8)} q4,30 -2,${f(50 + i * 8)}" stroke="#3d7a3a" stroke-width="1.2" fill="none"/>`;
    }
    const spread = jungle ? 60 : 44;
    for (let i = 0; i < 11; i++) {
      const x = 100 + rng.range(-spread, spread);
      const y = crownY + rng.range(-16, jungle ? 6 : 18);
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rng.range(14, 22))}" fill="${i % 2 ? leaf : leafDark}"/>`;
    }
    if (toxic) s += berries(100, crownY, 8, rng);
  }
  if (thorny) s += `<path d="M95,${ground - 6} l-4,-3 M105,${ground - 14} l4,-3 M95,${ground - 22} l-4,-3" stroke="#2a1c12" stroke-width="1.5"/>`;
  return s;
}

function frond(x0: number, y0: number, x1: number, y1: number, col: string, n: number): string {
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - 10;
  let s = `<path d="M${x0},${y0} Q${f(mx)},${f(my)} ${f(x1)},${f(y1)}" stroke="${col}" stroke-width="2" fill="none"/>`;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const len = 9 * (1 - t * 0.7);
    s += `<path d="M${f(x)},${f(y)} l${f(-len * 0.5)},${f(-len)} M${f(x)},${f(y)} l${f(len * 0.5)},${f(len * 0.6)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`;
  }
  return s;
}

function thorns(x: number, y: number, rng: RNG): string {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const px = x + rng.range(-40, 40);
    const py = y + rng.range(-25, 25);
    const a = rng.range(0, Math.PI * 2);
    s += `<path d="M${f(px)},${f(py)} l${f(Math.cos(a) * 5)},${f(Math.sin(a) * 5)}" stroke="#3a2a1a" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// animals
// ---------------------------------------------------------------------------

const eye = (x: number, y: number, r: number, fierce = false) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#fff"/><circle cx="${f(x + r * 0.25)}" cy="${f(y)}" r="${f(r * 0.55)}" fill="#111"/>${fierce ? `<path d="M${f(x - r * 1.3)},${f(y - r * 1.4)} L${f(x + r * 1.2)},${f(y - r * 0.6)}" stroke="#111" stroke-width="${f(r * 0.5)}"/>` : ''}`;

function spots(cx: number, cy: number, rx: number, ry: number, col: string, n: number, rng: RNG): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 0.75;
    s += `<circle cx="${f(cx + Math.cos(a) * rx * r)}" cy="${f(cy + Math.sin(a) * ry * r)}" r="${f(rng.range(2, 4.5))}" fill="${col}"/>`;
  }
  return s;
}

function animal(g: Genome, P: Pal, rng: RNG, id: string): string {
  const aquatic = g.habitat === 'aquatic';
  const amph = g.habitat === 'amphibious';
  const scene = aquatic ? waterScene(id, true, rng) : amph ? shoreScene(id, g, rng) : landScene(id, g, rng);
  let body: string;
  if (g.intel >= SENTIENCE && hasHumanoidBody(g)) body = person(g, P, rng);
  else if (g.tier === 2) body = simpleAnimal(g, P, rng, aquatic);
  else if (g.tier === 3) body = aquatic ? seaArthropod(g, P, rng) : amph ? crab(g, P, rng) : bug(g, P, rng);
  else if (aquatic) body = g.fur > 0.4 ? seaMammal(g, P, rng) : fish(g, P, rng);
  else if (amph) body = amphibian(g, P, rng);
  else if (g.flight > 0.5) body = flyer(g, P, rng);
  else if (g.fur > 0.4 && g.grasp > 0.5 && g.size < 8.3) body = primate(g, P, rng);
  else if (g.fur <= 0.4 && g.diet === 'carn' && g.size >= 7.5) body = theropod(g, P, rng);
  else body = beast(g, P, rng);
  return scene + body;
}

function simpleAnimal(g: Genome, P: Pal, rng: RNG, aquatic: boolean): string {
  if (aquatic && g.diet === 'herb' && g.speed < 0.12) {
    // a sponge: a porous vase on the sea floor
    let s = `<path d="M75,134 Q66,70 80,42 L120,42 Q134,70 125,134Z" fill="${P.body}" stroke="${P.dark}" stroke-width="2"/><ellipse cx="100" cy="42" rx="20" ry="6" fill="${P.dark}"/>`;
    for (let i = 0; i < 22; i++) s += `<circle cx="${f(rng.range(80, 120))}" cy="${f(rng.range(52, 128))}" r="${f(rng.range(1.5, 3.2))}" fill="${P.dark}"/>`;
    return s;
  }
  if (aquatic && g.diet !== 'herb') {
    // a jelly: a bell trailing tentacles, long and many if it stings
    const n = g.diet === 'carn' ? 9 : 5;
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 78 + (i * 44) / (n - 1);
      const len = g.diet === 'carn' ? 75 : 45;
      s += `<path d="M${f(x)},62 q6,${f(len / 4)} 0,${f(len / 2)} t0,${f(len / 2)}" stroke="${P.light}" stroke-width="1.5" fill="none" opacity="0.8"/>`;
    }
    s += `<path d="M70,64 Q70,22 100,22 Q130,22 130,64 Q115,58 100,64 Q85,58 70,64Z" fill="${P.body}" fill-opacity="0.65" stroke="${P.light}" stroke-width="2"/>`;
    s += `<path d="M86,40 q14,-10 28,0" stroke="${P.light}" stroke-width="2" fill="none" opacity="0.6"/>`;
    if (g.diet === 'omni') for (let i = 0; i < 6; i++) s += `<path d="M${76 + i * 9},${30 + Math.abs(i - 2.5) * 4} v22" stroke="${hsl(rng.range(0, 360), 80, 70)}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
    return s;
  }
  // worms: a ribbon on the sea floor or a segmented body in the soil
  const flat = aquatic;
  let s = '';
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) pts.push([40 + i * 7.5, (flat ? 120 : 112) + Math.sin(i * 0.7) * 10]);
  if (flat) {
    s += `<path d="M${pts.map((p) => `${f(p[0])},${f(p[1] - 8)}`).join(' L')} L${pts
      .slice()
      .reverse()
      .map((p) => `${f(p[0])},${f(p[1] + 8)}`)
      .join(' L')}Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5" stroke-linejoin="round"/>`;
    s += `<path d="M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')}" stroke="${P.light}" stroke-width="2" fill="none" opacity="0.5"/>`;
    s += eye(pts[16][0] - 3, pts[16][1] - 3, 2) + eye(pts[16][0] - 3, pts[16][1] + 3, 2);
  } else {
    for (let i = 0; i < pts.length; i++) s += `<circle cx="${f(pts[i][0])}" cy="${f(pts[i][1])}" r="${f(8 - Math.abs(i - 9) * 0.25)}" fill="${i % 2 ? P.body : P.light}" stroke="${P.dark}" stroke-width="0.8"/>`;
    if (g.diet === 'carn') s += `<path d="M${f(pts[16][0] + 6)},${f(pts[16][1] - 4)} l6,-3 M${f(pts[16][0] + 6)},${f(pts[16][1] + 4)} l6,3" stroke="${P.dark}" stroke-width="2"/>`;
  }
  return s;
}

function seaArthropod(g: Genome, P: Pal, rng: RNG): string {
  if (g.armor > 0.45 && g.speed > 0.4) {
    // sea scorpion: segmented armour, paddles and a spiked tail
    let s = `<path d="M44,92 L28,86" stroke="${P.dark}" stroke-width="4" stroke-linecap="round"/>`;
    for (let i = 0; i < 8; i++) s += `<ellipse cx="${50 + i * 9}" cy="92" rx="${8 + (i > 1 && i < 6 ? 6 : 2)}" ry="${10 + (i > 1 && i < 6 ? 6 : 0)}" fill="${i % 2 ? P.body : P.dark}"/>`;
    s += `<ellipse cx="128" cy="92" rx="16" ry="14" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>${eye(134, 86, 2.5)}`;
    s += `<path d="M118,104 q14,10 26,6 M118,80 q14,-10 26,-6" stroke="${P.dark}" stroke-width="3" fill="none"/>`;
    return s;
  }
  if (g.armor > 0.45) return g.diet === 'herb' ? snail(P) : crab(g, P, rng);
  if (g.speed <= 0.5 && g.grasp > 0.3) {
    // octopus-like: a soft head and curling arms
    let s = '';
    for (let i = 0; i < 8; i++) {
      const x = 70 + i * 8.5;
      const dir = i < 4 ? -1 : 1;
      s += `<path d="M${f(x)},88 q${dir * 6},22 ${dir * 2},36 q${dir * -3},8 ${dir * 8},10" stroke="${P.body}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    }
    s += `<ellipse cx="100" cy="66" rx="30" ry="32" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>${spots(100, 60, 22, 22, P.dark, 8, rng)}${eye(88, 78, 4)}${eye(112, 78, 4)}`;
    return s;
  }
  if (g.speed > 0.5 && g.diet === 'herb') {
    // shrimp: a curved, segmented body, fan tail and long feelers
    let s = '';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.15 + i * 0.32;
      const x = 100 + Math.cos(a) * 36;
      const y = 70 + Math.sin(a) * 36;
      s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(14 - i)}" ry="${f(11 - i * 0.8)}" fill="${i % 2 ? P.body : P.light}" stroke="${P.dark}" stroke-width="1"/>`;
    }
    s += `<path d="M66,110 l-14,-4 l6,10 l-10,6 l14,-2Z" fill="${P.light}"/>`;
    s += `<path d="M136,74 q30,-30 50,-40 M134,70 q20,-40 30,-60" stroke="${P.dark}" stroke-width="1.2" fill="none"/>${eye(136, 76, 3)}`;
    for (let i = 0; i < 5; i++) s += `<path d="M${110 + i * 6},${100 - i * 4} l-2,12" stroke="${P.dark}" stroke-width="1.2"/>`;
    return s;
  }
  if (g.diet === 'herb' && g.speed <= 0.5) return snail(P);
  // squid: a streamlined mantle with fins and arms
  return squid(P);
}

function snail(P: Pal): string {
  {
    // sea snail: a spiral shell on a muscular foot
    let s = `<path d="M50,122 Q100,112 150,122 Q120,128 50,124Z" fill="${P.belly}"/>`;
    s += `<circle cx="96" cy="90" r="30" fill="${P.body}" stroke="${P.dark}" stroke-width="2"/>`;
    s += `<path d="M96,90 m-22,0 a22,22 0 1,1 44,0 a17,17 0 1,1 -34,0 a12,12 0 1,1 24,0 a7,7 0 1,1 -14,0" fill="none" stroke="${P.dark}" stroke-width="2"/>`;
    s += `<path d="M140,118 l8,-22 M146,118 l12,-18" stroke="${P.belly}" stroke-width="3" stroke-linecap="round"/><circle cx="148" cy="95" r="2.5" fill="#111"/><circle cx="158" cy="99" r="2.5" fill="#111"/>`;
    return s;
  }
}

function squid(P: Pal): string {
  let s = `<path d="M150,72 Q110,40 70,64 Q66,72 70,80 Q110,104 150,72Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><path d="M150,72 l14,-14 l2,28Z" fill="${P.light}"/>`;
  for (let i = 0; i < 6; i++) s += `<path d="M70,${68 + i * 2.5} q-20,${f((i - 2.5) * 4)} -40,${f((i - 2.5) * 10)}" stroke="${P.body}" stroke-width="3" fill="none"/>`;
  s += `<path d="M70,72 q-30,4 -55,30 M70,74 q-26,10 -50,40" stroke="${P.light}" stroke-width="1.5" fill="none"/>${eye(80, 70, 4.5, true)}`;
  return s;
}

function crab(g: Genome, P: Pal, rng: RNG): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += `<path d="M${84 - i * 4},${100} q-18,${4 + i * 3} -26,${22 + i * 2}" stroke="${P.dark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M${116 + i * 4},${100} q18,${4 + i * 3} 26,${22 + i * 2}" stroke="${P.dark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  }
  s += `<path d="M76,86 q-20,-10 -26,-30 M124,86 q20,-10 26,-30" stroke="${P.body}" stroke-width="6" fill="none"/>`;
  s += `<path d="M42,52 q8,-10 16,0 q-8,4 -16,0Z M142,52 q8,-10 16,0 q-8,4 -16,0Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5" transform="scale(1)"/>`;
  s += `<ellipse cx="100" cy="96" rx="30" ry="${18 + g.armor * 6}" fill="${P.body}" stroke="${P.dark}" stroke-width="2"/>`;
  if (g.armor > 0.4) s += `<path d="M78,92 q22,-12 44,0" stroke="${P.light}" stroke-width="2" fill="none"/>`;
  if (g.toxin > 0.4) s += spots(100, 94, 24, 14, P.mark, 6, rng);
  s += `<line x1="92" y1="80" x2="90" y2="70" stroke="${P.dark}" stroke-width="2"/><line x1="108" y1="80" x2="110" y2="70" stroke="${P.dark}" stroke-width="2"/>${eye(90, 68, 3)}${eye(110, 68, 3)}`;
  return s;
}

function bug(g: Genome, P: Pal, rng: RNG): string {
  if (g.flight > 0.4) {
    if (g.diet === 'carn') {
      // dragonfly
      let s = `<path d="M100,70 L176,74 L100,78Z" fill="${P.body}"/>`;
      for (const [dy, sk] of [
        [-1, -1],
        [1, 1],
      ])
        s += `<ellipse cx="90" cy="${74 + dy * 16}" rx="36" ry="8" transform="rotate(${sk * 12} 90 74)" fill="#dff3ff" fill-opacity="0.45" stroke="#9fc8e0"/><ellipse cx="110" cy="${74 + dy * 14}" rx="30" ry="7" transform="rotate(${sk * -8} 110 74)" fill="#dff3ff" fill-opacity="0.45" stroke="#9fc8e0"/>`;
      s += `<ellipse cx="96" cy="74" rx="10" ry="7" fill="${P.dark}"/><circle cx="84" cy="74" r="7" fill="${P.light}"/>${eye(81, 71, 3)}${eye(81, 77, 3)}`;
      return s;
    }
    // butterfly: four broad painted wings
    const wing = hsl(P.hue + rng.range(-30, 30), 75, 58);
    let s = '';
    for (const sx of [-1, 1]) {
      s += `<path d="M100,72 C${100 + sx * 20},30 ${100 + sx * 70},30 ${100 + sx * 62},70 C${100 + sx * 55},80 ${100 + sx * 20},80 100,74Z" fill="${wing}" stroke="${P.dark}" stroke-width="1.5"/>`;
      s += `<path d="M100,76 C${100 + sx * 30},80 ${100 + sx * 54},96 ${100 + sx * 38},112 C${100 + sx * 24},116 ${100 + sx * 10},98 100,80Z" fill="${wing}" stroke="${P.dark}" stroke-width="1.5"/>`;
      s += `<circle cx="${100 + sx * 40}" cy="56" r="7" fill="${P.mark}"/><circle cx="${100 + sx * 40}" cy="56" r="3" fill="#fff"/>`;
    }
    s += `<ellipse cx="100" cy="82" rx="4" ry="22" fill="${P.dark}"/><path d="M98,60 q-6,-16 -14,-20 M102,60 q6,-16 14,-20" stroke="${P.dark}" stroke-width="1.2" fill="none"/>`;
    return s;
  }
  const legs = (x: number, y: number, n: number, span: number, len: number, col: string) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const lx = x - span / 2 + (i * span) / Math.max(1, n - 1);
      s += `<path d="M${f(lx)},${f(y)} l${f(-6 + i * 3)},${f(len * 0.5)} l${f(-3)},${f(len * 0.5)}" stroke="${col}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
    }
    return s;
  };
  if (g.social > 0.55) {
    // ants, never alone
    let s = '';
    for (const [x, y, k] of [
      [100, 104, 1],
      [48, 120, 0.6],
      [158, 116, 0.65],
    ] as [number, number, number][]) {
      s += `<g transform="translate(${x} ${y}) scale(${k})">${legs(0, 0, 3, 18, 18, P.dark)}${legs(0, 0, 3, 18, 18, P.dark).replace(/l-/g, 'l+')}<ellipse cx="-22" cy="-4" rx="14" ry="10" fill="${P.body}"/><ellipse cx="0" cy="-4" rx="8" ry="6" fill="${P.body}"/><circle cx="16" cy="-6" r="8" fill="${P.body}"/><path d="M20,-12 q8,-12 14,-10 M18,-13 q4,-14 10,-16" stroke="${P.dark}" stroke-width="1.3" fill="none"/>${g.horns > 0.3 ? `<path d="M22,-8 l10,-2" stroke="${P.dark}" stroke-width="2.5"/>` : ''}<circle cx="19" cy="-7" r="1.6" fill="#111"/></g>`;
    }
    return s;
  }
  if (g.diet === 'carn' && g.toxin <= 0.5) {
    // spider
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += `<path d="M96,92 q${-20 - i * 4},${-24 + i * 10} ${-36 - i * 2},${4 + i * 12}" stroke="${P.dark}" stroke-width="2.5" fill="none"/>`;
      s += `<path d="M104,92 q${20 + i * 4},${-24 + i * 10} ${36 + i * 2},${4 + i * 12}" stroke="${P.dark}" stroke-width="2.5" fill="none"/>`;
    }
    s += `<ellipse cx="100" cy="104" rx="20" ry="16" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><circle cx="100" cy="86" r="11" fill="${P.dark}"/>${spots(100, 104, 14, 10, P.light, 4, rng)}`;
    s += `<circle cx="96" cy="83" r="2" fill="#f2c14e"/><circle cx="104" cy="83" r="2" fill="#f2c14e"/><circle cx="92" cy="87" r="1.4" fill="#f2c14e"/><circle cx="108" cy="87" r="1.4" fill="#f2c14e"/>`;
    return s;
  }
  if (g.toxin > 0.5 && g.diet !== 'herb') {
    // scorpion
    let s = legs(100, 102, 4, 40, 16, P.dark) + legs(100, 102, 4, 40, 16, P.dark).replace(/l-/g, 'l+');
    s += `<ellipse cx="100" cy="100" rx="28" ry="12" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>`;
    s += `<path d="M72,100 q-22,-6 -24,-30 q0,-18 18,-20" stroke="${P.body}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M66,50 l8,-2 l-4,8Z" fill="${P.mark}"/>`;
    s += `<path d="M126,96 q16,-6 24,-18 M126,104 q16,4 26,-2" stroke="${P.body}" stroke-width="4" fill="none"/><path d="M148,74 q10,-6 12,4 q-6,0 -12,-4Z M150,98 q10,-6 12,4 q-6,0 -12,-4Z" fill="${P.dark}"/>`;
    return s;
  }
  if (g.armor > 0.4) {
    // beetle
    let s = legs(100, 96, 3, 30, 20, P.dark) + legs(100, 96, 3, 30, 20, P.dark).replace(/l-/g, 'l+');
    s += `<ellipse cx="96" cy="94" rx="34" ry="22" fill="${P.body}" stroke="${P.dark}" stroke-width="2"/><path d="M96,72 v44" stroke="${P.dark}" stroke-width="1.5"/><ellipse cx="86" cy="86" rx="10" ry="4" fill="#fff" opacity="0.3"/>`;
    s += `<ellipse cx="134" cy="94" rx="10" ry="9" fill="${P.dark}"/><path d="M142,88 q10,-12 18,-12 M142,98 q10,8 18,10" stroke="${P.dark}" stroke-width="1.5" fill="none"/>`;
    if (g.horns > 0.3) s += `<path d="M142,92 q16,-6 20,-24" stroke="${P.dark}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    if (g.toxin > 0.4) s += spots(96, 94, 26, 16, P.mark, 7, rng);
    return s;
  }
  // a many-legged crawler
  let s = '';
  for (let i = 0; i < 12; i++) {
    const x = 38 + i * 10;
    const y = 104 + Math.sin(i * 0.6) * 6;
    s += `<path d="M${x},${f(y + 4)} l-3,10 M${x},${f(y + 4)} l3,10" stroke="${P.dark}" stroke-width="1.5"/>`;
    s += `<ellipse cx="${x}" cy="${f(y)}" rx="7" ry="8" fill="${i % 2 ? P.body : P.light}" stroke="${P.dark}" stroke-width="1"/>`;
  }
  s += `${eye(152, 100, 2.4)}<path d="M156,96 q8,-10 14,-10" stroke="${P.dark}" stroke-width="1.2" fill="none"/>`;
  if (g.toxin > 0.4) s += spots(95, 104, 55, 6, P.mark, 8, rng);
  return s;
}

function fish(g: Genome, P: Pal, rng: RNG): string {
  const shark = g.diet === 'carn' && g.size >= 6;
  const one = (x: number, y: number, k: number) => {
    let s = `<g transform="translate(${x} ${y}) scale(${k})">`;
    s += `<path d="M-46,0 L-70,-20 L-64,0 L-70,20Z" fill="${P.dark}"/>`;
    s += shark ? `<path d="M-4,-14 L8,-40 L16,-14Z" fill="${P.dark}"/>` : `<path d="M-20,-16 Q0,-34 18,-16Z" fill="${P.dark}"/>`;
    s += `<path d="M${shark ? 58 : 44},${shark ? -2 : 0} Q20,-26 -46,0 Q20,26 ${shark ? 58 : 44},${shark ? -2 : 0}Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>`;
    s += `<path d="M44,2 Q10,16 -40,4" fill="${P.belly}" opacity="0.7"/>`;
    if (g.armor > 0.5) for (let i = 0; i < 5; i++) s += `<path d="M${-30 + i * 14},-12 l6,10 l-6,10" stroke="${P.light}" stroke-width="1.5" fill="none"/>`;
    else if (!shark) for (let i = 0; i < 3; i++) s += `<path d="M${-24 + i * 16},-14 v26" stroke="${P.mark}" stroke-width="3" opacity="0.6"/>`;
    if (g.toxin > 0.4) s += `<path d="M-18,-16 l4,-10 M-8,-18 l3,-10 M2,-18 l2,-10" stroke="${P.mark}" stroke-width="2"/>`;
    s += `<path d="M18,-6 q4,6 0,12" stroke="${P.dark}" stroke-width="1.5" fill="none"/>${eye(32, -4, 3.5, shark)}`;
    if (shark) s += `<path d="M42,6 l-3,3 l-3,-3 l-3,3 l-3,-3" stroke="#fff" stroke-width="1" fill="none"/>`;
    return `${s}</g>`;
  };
  if (g.social > 0.5 && !shark) return one(70, 50, 0.45) + one(140, 110, 0.5) + one(150, 46, 0.4) + one(100, 82, 0.8);
  return one(96, 80, shark ? 1.15 : 1);
}

function seaMammal(g: Genome, P: Pal, rng: RNG): string {
  const whale = g.size >= 8;
  let s = `<g transform="translate(100 82) scale(${whale ? 1.2 : 1})">`;
  s += `<path d="M-50,0 L-72,-14 L-66,0 L-72,14Z" fill="${P.dark}"/>`;
  s += `<path d="M56,0 Q40,-28 -50,-2 Q40,30 56,0Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><path d="M50,4 Q0,24 -44,4" fill="${P.belly}" opacity="0.7"/>`;
  s += `<path d="M10,10 q-4,16 -18,20" stroke="${P.dark}" stroke-width="6" stroke-linecap="round" fill="none"/>${eye(38, -4, 3)}`;
  if (whale) s += `<path d="M20,-22 q-6,-16 -12,-20 M20,-22 q4,-18 10,-20" stroke="#dff3ff" stroke-width="2" fill="none"/>`;
  else s += `<path d="M54,2 l8,-3 M54,4 l8,2" stroke="${P.dark}" stroke-width="1"/>`;
  return `${s}</g>${g.social > 0.5 ? `<g opacity="0.6" transform="translate(40 40) scale(0.35)"><path d="M56,0 Q40,-28 -50,-2 Q40,30 56,0Z" fill="${P.body}"/></g>` : ''}`;
}

function amphibian(g: Genome, P: Pal, rng: RNG): string {
  if (g.armor > 0.4 && g.diet === 'herb') {
    // turtle
    let s = `<path d="M60,112 l-6,10 M84,116 l-2,10 M118,116 l2,10 M140,112 l6,10" stroke="${P.dark}" stroke-width="7" stroke-linecap="round"/>`;
    s += `<ellipse cx="148" cy="100" rx="14" ry="10" fill="${P.light}"/>${eye(152, 96, 2.5)}`;
    s += `<path d="M52,110 Q56,58 100,58 Q144,58 148,110Z" fill="${P.body}" stroke="${P.dark}" stroke-width="2"/>`;
    for (const [x, y] of [
      [100, 76],
      [80, 90],
      [120, 90],
      [100, 98],
    ])
      s += `<path d="M${x - 10},${y} l5,-8 h10 l5,8 l-5,8 h-10Z" fill="none" stroke="${P.dark}" stroke-width="1.5"/>`;
    return s;
  }
  if (g.armor > 0.4) {
    // crocodile-like ambusher
    let s = `<path d="M20,104 Q60,86 120,96 L178,100 L178,106 L120,110 Q60,118 20,104Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>`;
    for (let i = 0; i < 10; i++) s += `<path d="M${36 + i * 9},${94 - (i > 2 && i < 8 ? 2 : 0)} l4,-5 l4,5" fill="${P.dark}"/>`;
    s += `<path d="M150,102 l3,3 l3,-3 l3,3 l3,-3 l3,3 l3,-3" stroke="#fff" stroke-width="1" fill="none"/>${eye(132, 94, 3, true)}`;
    s += `<path d="M60,108 l-6,12 M100,110 l-4,12" stroke="${P.dark}" stroke-width="6" stroke-linecap="round"/>`;
    return s;
  }
  if (g.fur > 0.4) {
    // otter-like: sleek, floating on its back
    let s = `<path d="M40,104 Q100,74 150,96 Q160,110 140,112 Q90,124 40,104Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5" stroke-dasharray="1 2"/>`;
    s += `<circle cx="150" cy="96" r="13" fill="${P.body}"/><circle cx="160" cy="98" r="3" fill="#111"/>${eye(152, 92, 2.5)}<path d="M40,104 q-20,4 -26,-6" stroke="${P.body}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    return s;
  }
  // frog: squat, big-eyed, legs folded under
  let s = `<path d="M62,116 q-20,-2 -22,-16 q14,-2 26,8 M138,116 q20,-2 22,-16 q-14,-2 -26,8" fill="${P.dark}"/>`;
  s += `<ellipse cx="100" cy="100" rx="38" ry="24" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><ellipse cx="100" cy="110" rx="26" ry="10" fill="${P.belly}"/>`;
  if (g.toxin > 0.4) s += spots(100, 94, 30, 14, P.mark, 9, rng);
  s += `<circle cx="84" cy="78" r="10" fill="${P.body}"/><circle cx="116" cy="78" r="10" fill="${P.body}"/>${eye(84, 77, 6)}${eye(116, 77, 6)}<path d="M84,98 q16,8 32,0" stroke="${P.dark}" stroke-width="1.5" fill="none"/>`;
  s += `<path d="M76,118 l-6,6 M124,118 l6,6" stroke="${P.dark}" stroke-width="4" stroke-linecap="round"/>`;
  return s;
}

function flyer(g: Genome, P: Pal, rng: RNG): string {
  if (g.fur > 0.35) {
    // bat
    let s = `<path d="M100,70 Q70,40 26,46 L40,56 L30,64 L46,68 L40,80 Q70,72 100,84Z M100,70 Q130,40 174,46 L160,56 L170,64 L154,68 L160,80 Q130,72 100,84Z" fill="${P.dark}" stroke="${P.body}" stroke-width="1"/>`;
    s += `<ellipse cx="100" cy="78" rx="11" ry="16" fill="${P.body}" stroke="${P.dark}" stroke-width="1" stroke-dasharray="1 2"/><path d="M92,64 l-2,-10 l6,6 M108,64 l2,-10 l-6,6" fill="${P.body}" stroke="${P.body}" stroke-width="2"/>${eye(96, 68, 2)}${eye(104, 68, 2)}`;
    return s;
  }
  // bird: hooked beak and talons for hunters
  const raptor = g.diet === 'carn';
  let s = `<path d="M96,80 Q60,30 18,44 Q50,52 66,74Z" fill="${P.dark}"/><path d="M104,76 Q140,26 182,40 Q150,50 132,72Z" fill="${P.dark}"/>`;
  for (let i = 0; i < 5; i++) s += `<path d="M${30 + i * 8},${48 + i * 2} l-6,8" stroke="${P.body}" stroke-width="2"/><path d="M${170 - i * 8},${44 + i * 2} l6,8" stroke="${P.body}" stroke-width="2"/>`;
  s += `<ellipse cx="100" cy="84" rx="22" ry="15" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/><ellipse cx="100" cy="90" rx="14" ry="8" fill="${P.belly}"/>`;
  s += `<path d="M80,86 l-22,8 l22,0Z" fill="${P.dark}"/><circle cx="122" cy="74" r="11" fill="${P.body}"/>${eye(126, 72, 3, raptor)}`;
  s += raptor ? `<path d="M132,72 q10,0 10,8 q-4,-3 -10,-2Z" fill="#e8b23a"/>` : `<path d="M132,72 l12,3 l-12,4Z" fill="#e8b23a"/>`;
  s += `<path d="M94,98 l-2,12 M106,98 l2,12" stroke="#c99a3a" stroke-width="2"/>`;
  if (g.horns > 0.3) s += `<path d="M118,64 q-6,-12 -16,-14 M124,64 q2,-12 8,-16" stroke="${P.dark}" stroke-width="3" fill="none"/>`;
  if (g.social > 0.5) s += `<path d="M40,24 q5,-5 10,0 q5,-5 10,0 M150,20 q4,-4 8,0 q4,-4 8,0" stroke="#333" stroke-width="1.5" fill="none"/>`;
  return s;
}

function primate(g: Genome, P: Pal, rng: RNG): string {
  // sitting upright on a branch, long arms, a thoughtful face
  const head = 15 + g.intel * 6;
  let s = `<path d="M10,90 Q100,80 190,96" stroke="#5a3d28" stroke-width="9" fill="none"/>`;
  s += `<path d="M86,78 q-20,10 -18,30 M114,78 q20,10 18,30" stroke="${P.body}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${g.fur > 0.6 ? '1 2' : '0'}"/>`;
  s += `<ellipse cx="100" cy="74" rx="20" ry="24" fill="${P.body}" stroke="${P.body}" stroke-width="4" stroke-dasharray="1 2"/><ellipse cx="100" cy="80" rx="11" ry="14" fill="${P.belly}"/>`;
  s += `<path d="M90,94 q-6,14 -2,26 M110,94 q6,14 2,26" stroke="${P.body}" stroke-width="8" stroke-linecap="round"/><path d="M84,74 q-34,30 -26,58" stroke="${P.body}" stroke-width="5" fill="none"/>`;
  s += `<circle cx="100" cy="${f(46 - head * 0.3)}" r="${f(head)}" fill="${P.body}" stroke="${P.body}" stroke-width="3" stroke-dasharray="1 2"/><ellipse cx="100" cy="${f(50 - head * 0.2)}" rx="${f(head * 0.65)}" ry="${f(head * 0.55)}" fill="${P.belly}"/>`;
  s += `<circle cx="${f(100 - head - 2)}" cy="${f(44 - head * 0.3)}" r="5" fill="${P.body}"/><circle cx="${f(100 + head + 2)}" cy="${f(44 - head * 0.3)}" r="5" fill="${P.body}"/>${eye(94, 44, 3)}${eye(106, 44, 3)}<path d="M96,56 q4,3 8,0" stroke="${P.dark}" stroke-width="1.5" fill="none"/>`;
  if (g.social > 0.5) s += `<g opacity="0.7" transform="translate(150 58) scale(0.45)"><ellipse cx="0" cy="40" rx="20" ry="24" fill="${P.body}"/><circle cx="0" cy="8" r="16" fill="${P.body}"/></g>`;
  return s;
}

function theropod(g: Genome, P: Pal, rng: RNG): string {
  let s = `<path d="M40,74 Q70,60 100,70 L138,64 L170,74 L166,86 L136,86 Q110,98 96,96 Q60,96 14,92 Q24,80 40,74Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>`;
  s += `<path d="M84,94 l-4,26 l-8,0 M106,94 l4,26 l8,0" stroke="${P.dark}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M120,84 l4,10 l4,-2" stroke="${P.dark}" stroke-width="3" fill="none"/>`;
  s += `<path d="M142,84 l3,3 l3,-3 l3,3 l3,-3 l3,3 l3,-3" stroke="#fff" stroke-width="1.2" fill="none"/>${eye(150, 72, 3, true)}`;
  for (let i = 0; i < 6; i++) s += `<path d="M${50 + i * 12},${70 - (i > 1 && i < 5 ? 3 : 0)} l4,-6 l4,6" fill="${P.dark}"/>`;
  if (g.toxin > 0.4) s += spots(80, 80, 34, 8, P.mark, 8, rng);
  return s;
}

function beast(g: Genome, P: Pal, rng: RNG): string {
  const fur = g.fur > 0.4;
  const big = Math.min(1, Math.max(0, (g.size - 4) / 6));
  const sauropod = !fur && g.diet !== 'carn' && g.size >= 9;
  const k = 0.8 + big * 0.35;
  const rx = 34 * k;
  const ry = (16 + g.armor * 5 + big * 4) * k;
  const legLen = (16 + g.speed * 16 + big * 6) * (fur ? 1 : 0.8);
  const legW = 4 + big * 7;
  const cx = 92;
  const cy = 120 - legLen - ry * 0.55;
  const furDash = fur ? ` stroke="${P.body}" stroke-width="5" stroke-dasharray="1 2.5" stroke-linecap="round"` : ` stroke="${P.dark}" stroke-width="1.5"`;
  let s = '';

  // the herd: a smaller companion behind
  if (g.social > 0.5) s += `<g opacity="0.55" transform="translate(150 ${f(cy - 12)}) scale(0.4)"><ellipse rx="${f(rx)}" ry="${f(ry)}" fill="${P.dark}"/><rect x="${f(-rx * 0.6)}" y="0" width="8" height="40" fill="${P.dark}"/><rect x="${f(rx * 0.5)}" y="0" width="8" height="40" fill="${P.dark}"/><circle cx="${f(rx + 10)}" cy="${f(-ry * 0.6)}" r="12" fill="${P.dark}"/></g>`;

  // far legs, darker
  for (const lx of [cx - rx * 0.5 + 6, cx + rx * 0.55 + 6]) s += `<path d="M${f(lx)},${f(cy)} l${f(g.speed * 4)},${f(legLen + ry * 0.55)}" stroke="${P.dark}" stroke-width="${f(legW)}" stroke-linecap="round"/>`;

  // tail
  if (sauropod || !fur) s += `<path d="M${f(cx - rx)},${f(cy)} Q${f(cx - rx - 30)},${f(cy + 4)} ${f(cx - rx - 58)},${f(cy + 18)}" stroke="${P.body}" stroke-width="${f(10 * k)}" fill="none" stroke-linecap="round"/>`;
  else s += `<path d="M${f(cx - rx + 4)},${f(cy - 4)} q-16,4 -20,22" stroke="${P.body}" stroke-width="${f(5 * k)}" fill="none" stroke-linecap="round"/>`;

  // neck and head
  let hx: number;
  let hy: number;
  if (sauropod) {
    hx = cx + rx + 34;
    hy = cy - 64;
    s += `<path d="M${f(cx + rx * 0.7)},${f(cy - 6)} Q${f(cx + rx + 30)},${f(cy - 20)} ${f(hx)},${f(hy)}" stroke="${P.body}" stroke-width="${f(14 * k)}" fill="none" stroke-linecap="round"/>`;
  } else {
    const graze = g.diet === 'herb' && !fur ? 0 : g.diet === 'herb' ? 10 : -4;
    hx = cx + rx + 12 * k;
    hy = cy - ry * 0.6 + graze;
    s += `<path d="M${f(cx + rx * 0.7)},${f(cy - ry * 0.3)} L${f(hx - 4)},${f(hy)}" stroke="${P.body}" stroke-width="${f(16 * k)}" stroke-linecap="round"/>`;
  }

  // body
  s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${P.body}"${furDash}/>`;
  s += `<ellipse cx="${f(cx + 4)}" cy="${f(cy + ry * 0.45)}" rx="${f(rx * 0.7)}" ry="${f(ry * 0.35)}" fill="${P.belly}" opacity="0.7"/>`;
  if (g.toxin > 0.4) s += spots(cx, cy - 2, rx * 0.9, ry * 0.7, P.mark, 10, rng);
  else if (rng.chance(0.5) && fur) for (let i = 0; i < 4; i++) s += `<path d="M${f(cx - rx * 0.5 + i * rx * 0.3)},${f(cy - ry * 0.9)} q4,${f(ry * 0.6)} 0,${f(ry * 1.1)}" stroke="${P.mark}" stroke-width="3" fill="none" opacity="0.5"/>`;

  // armour: a domed shell for slow plant-eaters, a row of plates for the rest
  if (g.armor > 0.5 && g.speed < 0.35 && g.diet === 'herb' && !fur) {
    s += `<path d="M${f(cx - rx * 1.05)},${f(cy + 4)} Q${f(cx)},${f(cy - ry * 2.4)} ${f(cx + rx * 1.05)},${f(cy + 4)}Z" fill="${P.dark}" stroke="${P.light}" stroke-width="1.5"/>`;
    for (let i = -1; i <= 1; i++) s += `<path d="M${f(cx + i * rx * 0.5 - 8)},${f(cy - ry * 0.6)} l8,-8 l8,8 l-8,8Z" fill="none" stroke="${P.light}" stroke-width="1.2"/>`;
  } else if (g.armor > 0.3) {
    for (let i = 0; i < 6; i++) {
      const px = cx - rx * 0.7 + (i * rx * 1.4) / 5;
      s += `<path d="M${f(px - 6)},${f(cy - ry * 0.85)} l6,${f(-8 - g.armor * 8)} l6,${f(8 + g.armor * 8)}Z" fill="${P.dark}"/>`;
    }
  }

  // near legs
  for (const lx of [cx - rx * 0.55, cx + rx * 0.5]) {
    s += `<path d="M${f(lx)},${f(cy)} l${f(-g.speed * 4)},${f(legLen + ry * 0.55)}" stroke="${P.body}" stroke-width="${f(legW)}" stroke-linecap="round"/>`;
    if (g.diet === 'carn') s += `<path d="M${f(lx - g.speed * 4 - 3)},${f(cy + legLen + ry * 0.55)} l-3,3 M${f(lx - g.speed * 4 + 2)},${f(cy + legLen + ry * 0.55)} l-2,3" stroke="#eee" stroke-width="1.2"/>`;
  }

  // head
  const hr = (10 + g.intel * 6) * k;
  s += `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${f(hr * 1.25)}" ry="${f(hr * 0.85)}" fill="${P.body}"${fur ? ` stroke="${P.body}" stroke-width="3" stroke-dasharray="1 2"` : ''}/>`;
  s += `<ellipse cx="${f(hx + hr * 0.9)}" cy="${f(hy + hr * 0.25)}" rx="${f(hr * 0.55)}" ry="${f(hr * 0.45)}" fill="${fur ? P.belly : P.body}"/>`;
  if (fur) s += `<path d="M${f(hx - hr * 0.6)},${f(hy - hr * 0.6)} l${f(-hr * 0.3)},${f(-hr * 0.9)} l${f(hr * 0.6)},${f(hr * 0.5)}Z" fill="${P.dark}"/>`;
  s += eye(hx + hr * 0.25, hy - hr * 0.2, Math.max(2, hr * 0.22), g.diet === 'carn');
  if (g.diet === 'carn') s += `<path d="M${f(hx + hr * 0.6)},${f(hy + hr * 0.55)} l2,4 l2,-4 l2,4" stroke="#fff" stroke-width="1.2" fill="none"/>`;

  // horns: they grow longer and sweep back with the horn gene
  if (g.horns > 0.15) {
    const L = 8 + g.horns * 34 * k;
    for (const dx of [-3, 4]) {
      s += `<path d="M${f(hx - hr * 0.2 + dx)},${f(hy - hr * 0.7)} q${f(-L * 0.6)},${f(-L * 0.5)} ${f(-L * 0.2)},${f(-L)}${g.horns > 0.6 ? ` q${f(L * 0.3)},${f(-L * 0.2)} ${f(L * 0.5)},${f(L * 0.1)}` : ''}" stroke="${dx < 0 ? '#c9b48a' : '#e8d6aa'}" stroke-width="${f(3 + g.horns * 3)}" fill="none" stroke-linecap="round"/>`;
    }
  }
  return s;
}

function person(g: Genome, P: Pal, rng: RNG): string {
  // the self-aware one: upright, a tool in hand, a fire at its feet
  let s = `<ellipse cx="62" cy="122" rx="16" ry="4" fill="#3a2a1a"/><path d="M52,122 q10,-30 10,-34 q4,14 12,34Z" fill="#ff9a3a"/><path d="M57,122 q5,-18 5,-22 q3,10 7,22Z" fill="#ffe08a"/>`;
  s += `<path d="M96,92 l-6,30 M106,92 l6,30" stroke="${P.dark}" stroke-width="7" stroke-linecap="round"/>`;
  s += `<path d="M86,60 L114,60 L110,96 L90,96Z" fill="${P.body}" stroke="${P.dark}" stroke-width="1.5"/>`;
  s += `<path d="M88,64 q-10,14 -14,26 M112,64 q14,4 22,-14" stroke="${P.light}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M136,10 L132,120" stroke="#6e4b30" stroke-width="3"/><path d="M136,10 l-4,10 l8,0Z" fill="#9aa"/>`;
  s += `<circle cx="100" cy="44" r="15" fill="${P.light}"/>${eye(95, 42, 2.6)}${eye(105, 42, 2.6)}<path d="M96,52 q4,3 8,0" stroke="${P.dark}" stroke-width="1.4" fill="none"/>`;
  if (g.fur > 0.4) s += `<path d="M85,40 Q100,22 115,40" stroke="${P.dark}" stroke-width="5" fill="none"/>`;
  return s;
}

/** The portrait of a species as an SVG string. */
export function portrait(g: Genome, hue: number, seed: number): string {
  const rng = new RNG(seed * 131 + 7);
  const id = `pt${uid++}`;
  const P = palette(g, hue, rng);
  let inner: string;
  if (g.tier <= 1) inner = microbe(g, P, rng, id);
  else if (isAuto(g)) inner = plant(g, P, rng, id);
  else inner = animal(g, P, rng, id);
  return `<svg class="portrait" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;
}
