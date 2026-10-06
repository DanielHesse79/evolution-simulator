import type { Genome } from "../sim/genome";

/** Natural-history miniatures. All art uses a 100-unit square, upper-left light,
 * warm ink and a restrained mineral/earth palette. No fonts, images or RNG.
 * The renderer rasterises these paths once and reuses them while animals move. */
const C = {
  ink: "#283d3a",
  moss: "#527657",
  leaf: "#77945e",
  mint: "#a4bea0",
  pine: "#326556",
  sand: "#c5b184",
  gold: "#bb9257",
  rust: "#af7152",
  clay: "#cb947d",
  cream: "#e8dfbd",
  brown: "#82654c",
  dark: "#4c5046",
  slate: "#688b93",
  blue: "#467780",
  plum: "#967b91",
};
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(Math.max(0, Math.min(255, ((n >> shift) & 255) + amount)));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

class Ink {
  constructor(readonly ctx: CanvasRenderingContext2D) {}
  wash(color: string): CanvasGradient {
    const g = this.ctx.createLinearGradient(20, 16, 67, 89);
    g.addColorStop(0, tint(color, 27));
    g.addColorStop(0.42, color);
    g.addColorStop(1, tint(color, -29));
    return g;
  }
  path(d: string, color: string, outline = true): void {
    const p = new Path2D(d),
      x = this.ctx;
    x.fillStyle = this.wash(color);
    x.fill(p);
    if (outline) {
      x.strokeStyle = "#263c38d9";
      x.lineWidth = 1.25;
      x.stroke(p);
    }
  }
  flat(d: string, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fill(new Path2D(d));
  }
  line(d: string, color = C.ink, width = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke(new Path2D(d));
  }
  oval(
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: string,
    angle = 0,
    outline = true,
  ): void {
    const p = new Path2D();
    p.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    this.ctx.fillStyle = this.wash(color);
    this.ctx.fill(p);
    if (outline) {
      this.ctx.strokeStyle = "#263c38d9";
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke(p);
    }
  }
  dot(x: number, y: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }
  eye(x: number, y: number, r = 1.8): void {
    this.dot(x, y, r + 0.5, C.cream);
    this.dot(x - 0.25, y, r, C.ink);
    this.dot(x - 0.6, y - 0.55, 0.5, "#ffffff");
  }
  leaf(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color = C.leaf,
    width = 9,
  ): void {
    const length = Math.hypot(dx, dy) || 1,
      nx = (-dy / length) * width,
      ny = (dx / length) * width;
    this.path(
      `M${x} ${y}Q${x + dx * 0.5 + nx} ${y + dy * 0.5 + ny} ${x + dx} ${y + dy}Q${x + dx * 0.5 - nx} ${y + dy * 0.5 - ny} ${x} ${y}Z`,
      color,
    );
    this.line(`M${x} ${y}L${x + dx * 0.8} ${y + dy * 0.8}`, "#d9e5b66b", 0.85);
  }
  shadow(y = 89, rx = 30): void {
    const x = this.ctx;
    x.save();
    x.translate(50, y);
    x.scale(1, 0.2);
    const g = x.createRadialGradient(0, 0, 1, 0, 0, rx);
    g.addColorStop(0, "#132f3033");
    g.addColorStop(1, "#132f3000");
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, rx, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
}

type Draw = (p: Ink) => void;
type Entry = { key: string; label: string; group: string; draw: Draw };
const entries: Entry[] = [];
function add(key: string, label: string, group: string, draw: Draw): void {
  entries.push({ key, label, group, draw });
}

// ------------------------------------------------------------------- flora
function conifer(p: Ink): void {
  p.shadow();
  p.path("M46 63L54 63L56 93L43 93Z", C.brown);
  p.path(
    "M50 5L59 25L55 24L68 41L62 40L79 59L71 58L88 79Q53 93 12 80L30 59L23 59L39 39L33 41L45 23L42 24Z",
    C.pine,
  );
  p.flat(
    "M50 6L46 32L35 42L45 39L40 57L24 66L40 62L32 79L18 80L48 83L54 48Z",
    "#a7b87955",
  );
  for (let i = 0; i < 4; i++) {
    const y = 31 + i * 14,
      w = 9 + i * 6;
    p.line(`M${50 - w} ${y + 5}Q49 ${y + 11} ${50 + w} ${y}`, "#183e3790", 1.3);
    p.line(`M${49 - w} ${y + 2}L45 ${y - 1}`, "#c0cea06b", 1);
  }
}
add("conifer", "Conifer", "Plants", conifer);
add("broadleaf", "Broadleaf tree", "Plants", (p) => {
  p.shadow();
  p.path(
    "M43 91L47 64L29 49L33 44L49 55L52 29L59 31L56 58L73 43L77 48L56 68L60 92Z",
    C.brown,
  );
  p.line("M51 65L51 87M35 51L48 62", "#d8bb88", 1.6);
  p.path(
    "M20 63Q6 60 13 46Q3 31 23 25Q21 11 41 14Q53 1 66 15Q87 11 87 32Q103 46 88 57Q84 72 67 67Q54 76 41 65Q27 73 20 63Z",
    C.moss,
  );
  p.path(
    "M15 43Q17 24 36 26Q33 10 51 13Q69 12 70 26Q55 27 58 40Q36 35 31 52Q21 56 15 43Z",
    C.leaf,
    false,
  );
  p.path("M62 43Q68 24 83 29Q96 37 84 49Q81 60 69 57Z", "#668953", false);
  for (const [x, y] of [
    [24, 32],
    [42, 22],
    [53, 46],
    [72, 35],
    [31, 54],
    [64, 58],
  ]) {
    p.line(`M${x - 3} ${y + 3}q4 -6 9 -3`, "#d1d8a16b", 1.7);
  }
});
function palm(p: Ink, fern: boolean): void {
  p.shadow();
  p.path(
    fern
      ? "M43 92L46 39L54 37L60 92Z"
      : "M38 93Q54 60 49 34L56 32Q65 65 49 94Z",
    C.brown,
  );
  for (let i = 0; i < 7; i++)
    p.line(`M${46 - i * 0.35} ${46 + i * 6}l10 3`, "#dfc09399", 1.6);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i * Math.PI) / 6,
      endX = 50 + Math.cos(a) * 44,
      endY = 43 + Math.sin(a) * 30;
    const d = `M51 37Q${(endX + 50) / 2} ${endY - 20} ${endX} ${endY + 14}Q${(endX + 50) / 2 + 4} ${endY - 3} 51 41Z`;
    p.path(d, i < 3 ? C.leaf : C.pine);
    p.line(
      `M51 38Q${(endX + 50) / 2} ${endY - 10} ${endX} ${endY + 12}`,
      "#cbcf8d88",
      0.9,
    );
    if (fern)
      for (let j = 1; j < 5; j++) {
        const x = 51 + ((endX - 51) * j) / 5,
          y = 38 + (endY - 24) * Math.sin((j / 5) * Math.PI) * 0.6;
        p.line(`M${x} ${y}l-4 7m4 -7l5 6`, "#a5b675", 1.3);
      }
  }
  if (!fern) {
    p.oval(48, 43, 4, 5, C.gold);
    p.oval(55, 42, 4, 5, C.brown);
  }
}
add("palm", "Palm / rainforest tree", "Plants", (p) => palm(p, false));
add("tree-fern", "Tree fern", "Plants", (p) => palm(p, true));
add("fern", "Fern", "Plants", (p) => {
  p.shadow(90, 26);
  for (let i = 0; i < 5; i++) {
    const tipX = 12 + i * 18,
      tipY = i === 2 ? 12 : 25 + Math.abs(2 - i) * 10;
    p.line(`M49 90Q${tipX} 65 ${tipX} ${tipY}`, C.pine, 2);
    for (let j = 1; j <= 5; j++) {
      const t = j / 6,
        x = 49 + (tipX - 49) * t,
        y = 90 + (tipY - 90) * t;
      p.leaf(x, y, -11 * (1 - t * 0.5), -10, C.leaf, 4);
      p.leaf(x, y, 12 * (1 - t * 0.4), -13, C.pine, 4);
    }
  }
});
add("kelp", "Kelp", "Plants", (p) => {
  p.shadow(92, 25);
  for (let i = 0; i < 4; i++) {
    const x = 24 + i * 17;
    p.path(
      `M48 93Q${x - 12} 69 ${x} 45Q${x + 17} 23 ${x + 3} 7Q${x + 26} 17 ${x + 10} 48Q${x} 71 53 94Z`,
      i % 2 ? C.pine : C.moss,
    );
    p.line(`M49 89Q${x - 5} 66 ${x + 6} 44`, "#bed49b88", 1.1);
    p.leaf(x + 5, 48, i % 2 ? 19 : -19, -17, C.leaf, 5);
    p.dot(x + 6, 57, 2.7, C.gold);
  }
});
add("shrub", "Leafy shrub", "Plants", (p) => {
  p.shadow(89, 34);
  p.line("M49 90L42 51M49 78L22 59M49 79L71 56M48 67L61 36", C.brown, 4);
  for (const [x, y, r] of [
    [23, 60, 17],
    [41, 42, 20],
    [66, 48, 21],
    [77, 68, 15],
    [46, 67, 24],
  ]) {
    p.path(
      `M${x - r} ${y}Q${x - r - 4} ${y - r * 0.7} ${x - r * 0.4} ${y - r}Q${x + r * 0.2} ${y - r * 1.25} ${x + r * 0.6} ${y - r * 0.7}Q${x + r * 1.3} ${y - r * 0.7} ${x + r} ${y + r * 0.2}Q${x + r * 0.9} ${y + r} ${x + r * 0.15} ${y + r * 0.85}Q${x - r * 0.9} ${y + r * 1.1} ${x - r} ${y}Z`,
      y < 60 ? C.leaf : C.moss,
    );
    p.line(`M${x - 6} ${y + 2}q3 -9 9 -8m-2 12q6 -7 10 -4`, "#d0daac88", 1.2);
  }
  for (const [x, y] of [
    [31, 63],
    [57, 50],
    [70, 71],
  ]) {
    p.dot(x, y, 2.4, C.rust);
    p.dot(x + 3, y + 3, 2, C.gold);
  }
});
add("moss", "Moss cushion", "Plants", (p) => {
  p.shadow(82, 38);
  p.path(
    "M9 77Q9 63 26 62Q23 49 41 51Q54 39 67 54Q88 50 91 75Q75 92 44 87Q21 89 9 77Z",
    C.moss,
  );
  for (let i = 0; i < 23; i++) {
    const x = 15 + ((i * 19) % 70),
      y = 63 + ((i * 11) % 20);
    p.line(`M${x} ${y + 5}l-2 -8m2 5l4 -5`, i % 2 ? C.leaf : C.mint, 1.8);
  }
  for (const [x, y] of [
    [32, 48],
    [53, 45],
    [71, 48],
  ]) {
    p.line(`M${x} 70Q${x + 7} ${y + 8} ${x} ${y}`, C.rust, 1.6);
    p.oval(x - 2, y, 4, 2, C.gold, -0.35);
  }
});
add("horsetail", "Horsetail", "Plants", (p) => {
  p.shadow();
  for (let i = 0; i < 5; i++) {
    const x = 21 + i * 14,
      top = 17 + ((i * 13) % 29);
    p.line(`M${x + 4} 91L${x} ${top}`, C.pine, 3.6);
    p.oval(x, top, 3, 7, C.brown);
    for (let y = top + 14; y < 85; y += 13) {
      p.line(`M${x - 3} ${y}h6`, C.cream, 1);
      p.line(
        `M${x} ${y}l-10 -8m10 8l10 -10m-10 10l-5 -12m5 12l5 -13`,
        C.leaf,
        1.8,
      );
    }
  }
});
function grass(p: Ink, sea = false): void {
  p.shadow(91, 27);
  for (let i = 0; i < 9; i++) {
    const x = 18 + i * 8,
      tip = 22 + ((i * 19) % 40);
    p.path(
      `M50 92Q${x - 6} 63 ${x} ${tip}Q${x + 5} 63 55 92Z`,
      i % 2 ? C.moss : C.leaf,
      false,
    );
  }
  if (!sea)
    for (const x of [30, 52, 70]) {
      p.line(`M${x} 88Q${x + 4} 44 ${x} 13`, C.gold, 1.4);
      for (let j = 0; j < 5; j++) {
        p.oval(x - 2, 19 + j * 4, 2, 4, C.sand, -0.5, false);
        p.oval(x + 3, 21 + j * 4, 2, 4, C.gold, 0.5, false);
      }
    }
}
add("grass", "Grass", "Plants", (p) => grass(p));
add("seagrass", "Sea grass", "Plants", (p) => grass(p, true));
add("flower", "Flowering herb", "Plants", (p) => {
  p.shadow(91, 23);
  p.line("M48 91Q38 58 49 27M47 79Q64 66 74 46", C.pine, 2.7);
  p.leaf(45, 76, -23, -19);
  p.leaf(46, 68, 24, -17, C.moss);
  p.leaf(46, 87, -20, -10);
  for (const [x, y, r] of [
    [49, 29, 13],
    [74, 48, 8],
    [29, 53, 7],
  ]) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      p.oval(
        x + Math.cos(a) * r * 0.64,
        y + Math.sin(a) * r * 0.64,
        r * 0.54,
        r * 0.33,
        C.cream,
        a,
      );
    }
    p.dot(x, y, r * 0.35, C.gold);
    p.dot(x - 1, y - 1, r * 0.15, "#ead891");
  }
});
add("cactus", "Desert succulent", "Plants", (p) => {
  p.shadow(92, 29);
  p.path(
    "M42 91V68H26Q15 67 15 56V38Q15 30 24 31Q31 31 31 39V52L42 53V20Q42 9 51 9Q62 9 62 21V63L72 60V47Q72 38 80 40Q87 41 87 49V66Q87 77 62 78V92Z",
    C.moss,
  );
  p.line(
    "M50 87V22M57 89V26M24 41V58Q25 62 39 62M76 51V65L65 69",
    "#bbcb8d",
    1.7,
  );
  for (const [x, y] of [
    [46, 31],
    [60, 49],
    [45, 72],
    [80, 57],
    [23, 46],
    [59, 83],
  ])
    p.line(`M${x} ${y}l-3 -3m3 3l3 -3`, "#e1d9ac", 1);
  p.oval(53, 12, 5, 3, C.rust);
  p.oval(58, 13, 4, 3, C.clay);
});
add("waterlily", "Water lily", "Plants", (p) => {
  p.oval(49, 74, 40, 15, C.pine);
  p.flat("M50 74L81 66L72 78Z", "#30555b");
  p.line("M14 74Q40 61 61 68", "#bccd9988", 1.4);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 10;
    p.path(
      `M50 69Q${x - 10} 51 ${x} ${38 + Math.abs(3 - i) * 4}Q${x + 15} 54 50 69Z`,
      i % 2 ? C.cream : "#cbb4b3",
    );
  }
  p.oval(50, 61, 11, 5, C.gold);
});
add("coral", "Coral colony", "Plants", (p) => {
  p.shadow(92, 34);
  for (const [d, w] of [
    ["M49 91L50 43L42 30L44 17", 8],
    ["M49 78L25 62L24 42L14 32", 7],
    ["M50 65L73 51L83 24", 7],
    ["M24 55L38 44L35 26", 5],
    ["M68 57L66 31L58 23", 5],
    ["M49 86L77 77L89 56", 6],
  ] as const) {
    p.line(d, "#473f37", w + 2);
    p.line(d, C.rust, w);
    p.line(d, "#e8b78e", w * 0.3);
  }
  for (const [x, y] of [
    [44, 17],
    [14, 32],
    [35, 26],
    [83, 24],
    [58, 23],
    [89, 56],
  ])
    p.oval(x, y, 4, 3, C.clay);
});

// ----------------------------------------------------------- microscopic life
add("bacterium", "Bacterium", "Microbes & mats", (p) => {
  p.line(
    "M24 67Q5 76 11 88Q17 97 5 97M76 33Q94 23 87 12Q79 2 97 5",
    C.mint,
    1.8,
  );
  p.path(
    "M23 41Q11 56 24 70Q36 82 49 70L77 46Q91 32 77 20Q65 9 52 19Z",
    C.pine,
  );
  p.path(
    "M29 44Q21 54 30 62Q37 69 47 62L71 41Q80 32 72 26Q65 21 57 28Z",
    C.leaf,
    false,
  );
  p.line(
    "M34 55q5 -13 12 -1t15 -13M27 38l-7 -3m17 -6l-5 -7m40 37l7 5m-23 7l4 7",
    C.cream,
    1.7,
  );
  for (const [x, y] of [
    [38, 42],
    [59, 32],
    [52, 53],
    [31, 59],
    [68, 39],
  ])
    p.dot(x, y, 2, C.gold);
});
add("alga", "Single-celled alga", "Microbes & mats", (p) => {
  p.line("M42 22Q25 2 12 14M56 19Q56 1 77 8", C.mint, 1.6);
  p.oval(49, 53, 30, 35, C.pine, -0.2);
  p.oval(45, 49, 24, 29, C.leaf, -0.2, false);
  p.path("M30 61Q21 39 41 27Q27 44 41 51Q52 61 64 39Q71 66 52 74Z", C.moss);
  p.oval(48, 47, 8, 9, C.mint);
  p.dot(60, 33, 3, C.rust);
  p.dot(38, 58, 3, C.gold);
  p.line("M33 31Q23 45 27 55", "#e1edc3aa", 2);
});
add("protist", "Protist", "Microbes & mats", (p) => {
  p.path(
    "M28 24Q37 7 49 19Q59 27 73 21Q92 23 83 43Q77 51 87 65Q89 83 72 82Q59 75 46 86Q29 97 25 77Q26 64 13 58Q1 44 20 38Z",
    C.slate,
  );
  p.path(
    "M31 29Q45 25 51 36Q65 28 76 37Q62 49 72 64Q61 69 48 76Q36 76 34 61Q20 51 29 43Z",
    C.mint,
    false,
  );
  p.oval(49, 53, 12, 10, C.plum, 0.4);
  p.oval(47, 51, 5, 4, C.clay);
  p.oval(32, 40, 5, 6, C.cream);
  p.oval(66, 61, 5, 4, C.cream);
  p.dot(58, 34, 3, C.gold);
});
add("algal-mat", "Algal mat", "Microbes & mats", (p) => {
  p.shadow(79, 38);
  p.path(
    "M9 63Q16 51 31 57Q40 42 54 51Q73 42 83 58Q99 66 85 78Q72 85 53 80Q40 92 26 80Q7 80 9 63Z",
    C.pine,
  );
  for (let i = 0; i < 14; i++) {
    const x = 19 + ((i * 17) % 64),
      y = 58 + ((i * 13) % 20);
    p.line(`M${x} ${y}q-5 -8 2 -8t4 10q4 4 7 -2`, i % 2 ? C.leaf : C.mint, 2);
  }
});
add("lichen", "Lichen", "Microbes & mats", (p) => {
  p.shadow(85, 36);
  p.path("M12 80L19 58L36 47L67 43L88 59L93 81L61 89L33 88Z", C.slate);
  for (const [x, y, r] of [
    [29, 65, 10],
    [47, 55, 9],
    [62, 68, 14],
    [38, 77, 9],
    [76, 57, 7],
  ]) {
    p.path(
      `M${x - r} ${y}q-4 -7 5 -8q0 -8 8 -4q9 -5 10 4q10 1 5 9q2 8 -9 6q-6 7 -10 0q-10 2 -9 -7Z`,
      C.gold,
    );
    p.oval(x + 2, y, 3, 2, C.rust);
    p.line(`M${x - 4} ${y + 3}l-2 -6m2 6l5 2`, C.cream, 1);
  }
});

// -------------------------------------------------------------- marine life
add("sponge", "Sponge", "Sea life", (p) => {
  p.shadow(91, 32);
  for (const [x, y, w] of [
    [23, 49, 10],
    [44, 24, 13],
    [66, 43, 12],
    [79, 62, 8],
  ]) {
    p.path(
      `M${x - w} 87Q${x - w - 2} 60 ${x - w} ${y}Q${x} ${y - 8} ${x + w} ${y}L${x + w + 2} 85Q${x} 95 ${x - w} 87Z`,
      C.gold,
    );
    p.oval(x, y, w, 5, C.cream);
    p.oval(x, y, w * 0.62, 3, C.brown);
    for (let j = 0; j < 5; j++)
      p.oval(x - 3 + (j % 2) * 6, y + 10 + j * 5, 1.8, 2.4, C.brown, 0, false);
  }
});
add("jelly", "Jellyfish", "Sea life", (p) => {
  for (let i = 0; i < 6; i++) {
    const x = 26 + i * 9;
    p.line(
      `M${x} 47Q${x - 10} 63 ${x + 1} 71T${x - 4} 94`,
      i % 2 ? C.plum : C.clay,
      i % 2 ? 2 : 3.5,
    );
  }
  p.path(
    "M15 46Q19 10 49 11Q79 10 87 45Q78 54 70 47Q59 57 50 48Q40 57 31 49Q22 54 15 46Z",
    C.plum,
  );
  p.path("M23 39Q26 17 47 17Q65 18 71 38Q50 32 23 39Z", "#c7b0b6", false);
  p.line(
    "M20 46Q49 34 82 45M36 35Q32 26 40 21M60 34Q65 26 58 20",
    C.cream,
    1.2,
  );
});
function claws(p: Ink, sea = false): void {
  p.line("M35 51L18 42L16 27M63 52L82 39L84 26", C.rust, 5);
  p.path("M17 35Q1 29 10 15L15 25L21 13Q30 24 21 33Z", sea ? C.slate : C.rust);
  p.path("M80 33Q70 25 77 12L84 23L90 12Q99 26 87 34Z", sea ? C.slate : C.rust);
}
add("sea-scorpion", "Sea scorpion", "Sea life", (p) => {
  p.path("M56 63Q74 67 73 78L85 87L97 84L88 95L75 89L63 78L50 77Z", C.slate);
  for (let i = 0; i < 4; i++) {
    const y = 43 + i * 8;
    p.line(
      `M36 ${y}L21 ${y + 4}L12 ${y + 12}M61 ${y}L77 ${y + 2}L83 ${y + 11}`,
      C.blue,
      3,
    );
  }
  claws(p, true);
  p.oval(49, 57, 15, 25, C.blue);
  p.path("M32 45L37 29Q48 19 62 30L67 45Z", C.slate);
  for (let i = 0; i < 5; i++) p.line(`M37 ${48 + i * 6}q12 6 24 0`, C.mint, 1);
  p.eye(39, 33);
  p.eye(58, 32);
});
add("mollusc", "Bivalve shell", "Sea life", (p) => {
  p.shadow(85, 35);
  p.path(
    "M48 84Q13 76 10 47Q6 32 21 34Q19 14 36 22Q47 3 59 21Q78 12 80 30Q100 29 92 48Q90 74 55 84Z",
    C.clay,
  );
  for (let i = 0; i < 7; i++) {
    const x = 17 + i * 11;
    p.line(
      `M51 80Q${x} 57 ${x} ${i === 3 ? 18 : 30}`,
      i % 2 ? C.cream : C.rust,
      1.7,
    );
  }
  p.path("M42 79L59 79L64 90L36 90Z", C.brown);
  p.line("M17 47Q47 31 87 47", "#efdbc38f", 1.5);
});
add("crab", "Crab", "Sea life", (p) => {
  p.shadow(84, 36);
  for (let i = 0; i < 4; i++) {
    const y = 51 + i * 7;
    p.line(
      `M35 ${y}L${18 - i * 2} ${y + 3}L${12 + i * 2} ${y + 17}M65 ${y}L${84 + i} ${y + 2}L${89 - i * 2} ${y + 15}`,
      C.rust,
      3,
    );
  }
  claws(p);
  p.path("M23 52L33 42Q52 37 71 45L79 55L71 75Q49 85 28 73Z", C.rust);
  p.path("M31 53Q48 39 68 50L70 60Q49 52 30 61Z", C.clay, false);
  p.line("M37 46L34 37M62 44L66 36", C.brown, 3);
  p.eye(34, 36, 2);
  p.eye(66, 35, 2);
  p.line("M40 70Q51 76 63 68", C.cream, 1.2);
});
add("shrimp", "Shrimp", "Sea life", (p) => {
  p.line("M30 39Q4 4 7 25M32 43Q7 23 5 45", C.gold, 1.2);
  p.path(
    "M23 48L12 34L43 38Q80 29 88 54Q99 74 75 87L66 78L76 69Q83 60 69 58L35 60Z",
    C.clay,
  );
  p.path("M74 79L63 87L66 96L80 90L88 79Z", C.rust);
  for (let i = 0; i < 6; i++)
    p.line(`M${41 + i * 7} ${40 + i * 0.9}q-7 9 0 19`, C.rust, 1.5);
  for (let i = 0; i < 5; i++)
    p.line(`M${33 + i * 7} 58l-8 14l-5 2`, C.sand, 1.4);
  p.eye(29, 44, 2);
  p.line("M35 43Q57 35 73 46", C.cream, 1.4);
});
add("squid", "Squid", "Sea life", (p) => {
  for (let i = 0; i < 6; i++)
    p.line(
      `M38 ${48 + i * 3}Q${12 + i * 2} ${36 + i * 8} ${10 + i * 4} ${70 + i * 3}T${30 + i * 2} ${87 - i}`,
      i % 2 ? C.clay : C.rust,
      2.6,
    );
  p.path("M43 37Q61 27 83 12L78 38L96 50L76 58L61 65L39 58Z", C.rust);
  p.path("M38 42Q58 30 84 14Q82 52 56 63L39 59Z", C.clay);
  p.oval(35, 53, 12, 11, C.clay);
  p.eye(33, 49, 3);
  p.line("M48 45L71 26M49 51L72 37", "#ebccae", 1.2);
});
add("octopus", "Octopus", "Sea life", (p) => {
  const arms = [
    "M41 58Q14 44 10 68Q7 84 24 78",
    "M43 64Q25 61 23 84Q26 96 35 83",
    "M46 65Q36 69 41 91",
    "M49 65Q48 83 55 91",
    "M55 64Q62 70 66 89Q74 93 75 83",
    "M59 61Q80 59 81 79Q88 88 94 74",
    "M40 54Q20 37 12 56",
    "M61 55Q81 42 90 61",
  ];
  for (const d of arms) {
    p.line(d, C.brown, 8);
    p.line(d, C.rust, 5);
  }
  p.path("M31 48Q21 17 47 11Q76 6 74 35L64 58Q49 70 34 58Z", C.rust);
  p.path("M33 37Q31 15 48 17Q64 17 60 34Z", C.clay, false);
  p.eye(37, 50, 2.4);
  p.eye(60, 49, 2.4);
  for (let i = 0; i < 6; i++) {
    p.dot(16 + i * 2, 66 + i, 1.3, C.cream);
    p.dot(73 + i * 2, 67 + i * 2, 1.3, C.cream);
  }
});
function fish(
  p: Ink,
  kind: "grazer" | "predator" | "shark" | "shoal" | "forager" | "armored",
): void {
  const shark = kind === "shark",
    grazer = kind === "grazer" || kind === "forager",
    armor = kind === "armored";
  const color = shark ? C.slate : armor ? C.brown : grazer ? C.gold : C.blue;
  p.path(
    shark
      ? "M71 49L92 18L86 48L97 65L76 59Z"
      : "M72 49L95 30L89 51L97 72L72 59Z",
    color,
  );
  p.path(
    shark
      ? "M39 44L53 15L58 44L70 49L63 72L51 60Z"
      : grazer
        ? "M35 36L44 20L60 24L66 42L64 69L42 81L36 62Z"
        : "M32 41L46 26L58 42L61 59L48 76L39 58Z",
    tintHex(color, -12),
  );
  p.path(
    shark
      ? "M4 52Q28 32 57 41L83 53Q48 73 17 61Z"
      : grazer
        ? "M10 52Q25 21 48 30Q66 29 80 52Q64 78 37 74Q18 73 10 52Z"
        : "M6 51Q25 35 50 38Q68 41 81 52Q62 68 35 65L12 59Z",
    color,
  );
  p.flat(
    grazer
      ? "M13 57Q41 77 76 55Q54 80 34 71Z"
      : "M8 55Q36 65 79 53Q60 68 28 63Z",
    "#dbe2c19c",
  );
  p.path("M41 52Q56 49 59 63L46 61Z", C.sand);
  p.eye(grazer ? 23 : 19, grazer ? 47 : 49, 2);
  p.line("M30 44Q35 53 29 62M10 55L20 56", C.ink, 1);
  if (shark) {
    for (let i = 0; i < 3; i++) p.line(`M${32 + i * 4} 48l-2 10`, C.ink, 1);
    p.line("M9 56l4 -2l2 3l3 -2", C.cream, 1);
  } else if (armor) {
    p.path("M9 48L27 37L40 41L38 63L22 64L9 58Z", C.slate);
    p.line("M25 40L26 60L37 54M12 51L26 48", C.mint, 1.5);
    p.eye(19, 47);
  } else if (grazer) {
    for (let i = 0; i < 3; i++)
      p.path(
        `M${37 + i * 10} 33q-7 17 1 37l4 -1q-7 -21 0 -34Z`,
        i % 2 ? C.cream : C.pine,
        false,
      );
  } else p.line("M36 45L68 50M38 58L61 57", C.mint, 1.3);
}
function tintHex(hex: string, n: number): string {
  const c = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [16, 8, 0]
      .map((s) =>
        Math.max(0, Math.min(255, ((c >> s) & 255) + n))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
add("grazing-fish", "Grazing fish", "Sea life", (p) => fish(p, "grazer"));
add("predatory-fish", "Predatory fish", "Sea life", (p) => fish(p, "predator"));
add("shoaling-fish", "Shoaling fish", "Sea life", (p) => {
  fish(p, "shoal");
  p.line("M38 44L66 49", C.gold, 2.4);
});
add("foraging-fish", "Foraging fish", "Sea life", (p) => {
  fish(p, "forager");
  p.dot(54, 47, 3, C.rust);
});
add("shark", "Shark", "Sea life", (p) => fish(p, "shark"));
add("armored-fish", "Armored fish", "Sea life", (p) => fish(p, "armored"));
add("whale", "Whale", "Sea life", (p) => {
  p.path(
    "M71 48Q86 56 85 35L73 24Q88 22 91 36Q95 23 99 25L97 45Q92 64 73 67Z",
    C.blue,
  );
  p.path("M7 48Q9 26 38 29Q64 27 81 52Q77 70 43 77Q7 81 7 48Z", C.slate);
  p.flat("M9 60Q44 78 77 57Q55 86 20 75Z", "#c7d5c19e");
  p.path("M37 59Q51 57 62 83Q42 80 37 59Z", C.blue);
  p.eye(17, 52, 1.7);
  p.line("M9 60Q24 66 33 61M18 67Q24 70 30 70", C.ink, 1);
  p.line("M25 27Q16 5 10 13M26 26Q26 2 37 10", "#d4e6d5", 2);
});
function seal(p: Ink, manatee = false): void {
  p.path(
    manatee
      ? "M72 57Q94 47 96 60Q98 76 74 70Z"
      : "M73 59L95 43L88 60L97 66L77 71Z",
    C.slate,
  );
  p.path(
    "M13 47Q13 33 28 32Q40 35 46 44Q67 43 84 63Q66 82 34 75Q19 70 13 47Z",
    manatee ? C.moss : C.slate,
  );
  p.path("M42 58Q58 70 48 84Q36 78 34 62Z", manatee ? C.moss : C.blue);
  p.oval(14, 47, 10, 7, C.sand);
  p.eye(22, 40);
  p.line("M6 48L20 50M9 52l-6 3m9 -5l-8 -6", C.ink, 1);
  p.line("M31 47Q51 61 76 61", "#d2ddbc66", 2);
}
add("seal", "Seal", "Sea life", (p) => seal(p));
add("manatee", "Sea cow", "Sea life", (p) => seal(p, true));
add("otter", "Otter", "Sea life", (p) => {
  p.path("M67 57Q90 53 96 40Q94 65 72 72Z", C.brown);
  p.path("M24 46Q43 32 68 50Q84 63 66 74L31 71Z", C.brown);
  p.path("M38 62L32 80L19 81L26 69M62 62L73 80L62 82L54 71Z", C.dark);
  p.oval(22, 47, 15, 12, C.brown);
  p.oval(14, 53, 9, 5, C.sand);
  p.oval(27, 35, 4, 5, C.brown);
  p.eye(18, 44);
  p.flat("M25 55Q32 67 49 67L44 72Q26 70 21 58Z", "#d3ba899e");
  p.line("M11 51L3 48M11 55L3 57", C.cream, 1);
});

// --------------------------------------------------------------- arthropods
add("dragonfly", "Dragonfly", "Insects & arachnids", (p) => {
  for (const [x, y, a] of [
    [29, 32, 0.55],
    [71, 32, -0.55],
    [27, 59, -0.35],
    [73, 59, 0.35],
  ]) {
    p.oval(x, y, 25, 6, C.mint, a);
    p.line(`M50 48L${x - 12} ${y}M${x - 7} ${y - 4}l8 8`, "#5b807a", 0.8);
  }
  p.path("M47 37L53 37L53 83L50 96L46 83Z", C.blue);
  for (let y = 56; y < 88; y += 6) p.line(`M47 ${y}h5`, C.sand, 1);
  p.oval(50, 39, 6, 11, C.pine);
  p.oval(50, 26, 8, 6, C.slate);
  p.eye(45, 25, 2);
  p.eye(55, 25, 2);
  p.line("M46 40L35 34M54 40L65 34M46 48L37 56M54 48L63 56", C.ink, 1.2);
});
add("butterfly", "Butterfly", "Insects & arachnids", (p) => {
  p.path(
    "M47 47Q23 4 8 22Q1 49 32 59Q7 65 20 83Q39 96 49 59Q59 94 80 82Q96 64 69 58Q99 46 91 20Q75 3 53 46Z",
    C.rust,
  );
  p.path(
    "M43 47Q21 15 15 26Q13 46 36 53ZM57 47Q79 14 85 25Q88 46 64 53Z",
    C.gold,
  );
  p.path(
    "M40 64Q19 62 25 78Q37 84 44 65M61 64Q82 62 76 78Q63 85 56 64",
    C.sand,
  );
  for (const x of [25, 75]) {
    p.oval(x, 37, 5, 7, C.dark);
    p.dot(x, 37, 2, C.cream);
  }
  p.line("M49 39Q37 23 39 17M51 39Q64 23 61 17", C.ink, 1.4);
  p.oval(50, 54, 4, 22, C.dark);
});
add("ant", "Ant", "Insects & arachnids", (p) => {
  for (const d of [
    "M39 53L31 70L16 80",
    "M48 54L53 77L44 88",
    "M56 52L73 73L84 79",
    "M39 49L26 29L19 30",
    "M49 48L54 26L62 18",
    "M58 48L74 36L87 35",
  ])
    p.line(d, C.brown, 2.5);
  p.oval(72, 51, 19, 13, C.brown, -0.25);
  p.oval(47, 49, 10, 8, C.rust);
  p.oval(24, 48, 13, 11, C.brown);
  p.line("M17 40L8 24L2 26M26 38L29 21L23 15", C.dark, 1.5);
  p.eye(19, 44);
  p.line("M13 53l-7 3l4 -6", C.ink, 2);
  p.line("M66 43Q76 39 82 47", C.sand, 1.5);
});
function scorpion(p: Ink): void {
  p.path(
    "M57 63Q87 71 87 48Q90 26 72 21Q61 21 65 34L73 40L69 29Q78 30 78 43Q79 56 56 52Z",
    C.gold,
  );
  for (let i = 0; i < 4; i++)
    p.line(
      `M38 ${50 + i * 6}L${23 - i * 2} ${53 + i * 7}L${17 + i} ${62 + i * 7}M60 ${51 + i * 6}l16 9l-2 7`,
      C.brown,
      2.6,
    );
  claws(p);
  p.oval(49, 57, 14, 23, C.brown);
  for (let y = 43; y < 78; y += 7) p.line(`M38 ${y}q10 5 22 0`, C.sand, 1.2);
  p.eye(43, 36, 1.6);
  p.eye(54, 36, 1.6);
}
add("scorpion", "Scorpion", "Insects & arachnids", scorpion);
add("beetle", "Beetle", "Insects & arachnids", (p) => {
  for (let i = 0; i < 3; i++)
    p.line(
      `M32 ${42 + i * 14}L19 ${36 + i * 21}L12 ${47 + i * 19}M68 ${42 + i * 14}L82 ${36 + i * 21}L89 ${47 + i * 19}`,
      C.brown,
      2.8,
    );
  p.oval(50, 61, 25, 31, C.pine);
  p.path("M49 33Q28 35 26 64Q27 83 49 91Z", C.moss);
  p.line("M50 35V88M36 45Q29 65 36 79M61 44Q70 62 63 80", C.mint, 1.1);
  p.oval(50, 31, 16, 10, C.blue);
  p.oval(50, 20, 10, 7, C.dark);
  p.line("M44 17L33 7L26 10M55 17L65 7L73 11", C.brown, 2);
  p.eye(43, 20, 1.5);
  p.eye(57, 20, 1.5);
});
add("spider", "Spider", "Insects & arachnids", (p) => {
  for (let i = 0; i < 4; i++) {
    const y = 44 + i * 5;
    for (const sign of [-1, 1])
      p.line(
        `M${50 + sign * 7} ${y}L${50 + sign * (22 + i * 3)} ${20 + i * 16}L${50 + sign * (37 + (i % 2) * 4)} ${34 + i * 17}`,
        C.brown,
        3.2,
      );
  }
  p.oval(50, 64, 16, 22, C.brown);
  p.path("M47 49L41 62L47 73L53 72L59 62L53 49Z", C.gold, false);
  p.oval(50, 39, 11, 12, C.dark);
  p.line("M45 32l-6 -9M55 32l6 -9", C.dark, 2.7);
  p.eye(46, 32, 1.7);
  p.eye(54, 32, 1.7);
});
add("millipede", "Millipede", "Insects & arachnids", (p) => {
  for (let i = 0; i < 10; i++) {
    const x = 16 + i * 7,
      y = 57 + Math.sin(i * 0.6) * 10;
    p.line(`M${x} ${y}l-4 14l-4 1m8 -15l7 10l5 -1`, C.gold, 1.8);
  }
  for (let i = 9; i >= 0; i--) {
    const x = 16 + i * 7,
      y = 55 + Math.sin(i * 0.6) * 10;
    p.oval(x, y, 7, 9, i % 2 ? C.brown : C.rust);
    p.line(`M${x - 3} ${y - 5}q2 -3 5 0`, C.sand, 1);
  }
  p.line("M15 50L7 40M19 48L18 35", C.brown, 1.6);
  p.eye(13, 53, 1.5);
});

// ---------------------------------------------------------- soft land animals
add("snail", "Snail", "Reptiles & small animals", (p) => {
  p.shadow(83, 37);
  p.path("M9 70L12 49L22 50L27 70Q51 72 78 76L94 83Q42 91 8 82Z", C.moss);
  p.line("M13 51L7 32M22 51L25 31", C.moss, 3);
  p.eye(7, 31, 1.4);
  p.eye(25, 30, 1.4);
  p.oval(56, 54, 28, 27, C.gold);
  p.oval(52, 51, 20, 20, C.sand);
  p.line(
    "M69 61C82 36 47 24 37 44C25 67 62 77 65 53C68 39 44 38 44 52C43 65 61 62 57 50",
    C.brown,
    2.6,
  );
  p.line("M29 81Q58 86 87 82", C.mint, 1);
});
add("worm", "Worm", "Reptiles & small animals", (p) => {
  p.line("M11 60C29 30 52 76 72 56Q86 40 93 48", C.brown, 13);
  p.line("M11 58C29 28 52 74 72 54Q86 38 93 46", C.clay, 10);
  for (let i = 0; i < 13; i++) {
    const x = 14 + i * 6,
      y = 53 + Math.sin((i - 2) * 0.53) * 8;
    p.line(`M${x - 1} ${y - 3}l-2 7`, C.rust, 1.1);
  }
  p.line("M30 45l-3 8m7 -7l-3 9", C.sand, 3);
  p.line("M14 53Q22 43 30 46", "#ead8ba", 1.4);
});
add("frog", "Frog", "Reptiles & small animals", (p) => {
  p.shadow(82, 33);
  p.path(
    "M43 60L31 79L8 82L19 72L24 50M64 48Q90 47 88 63L74 78L92 81L88 86L57 80L68 66Z",
    C.moss,
  );
  p.path("M27 42Q42 30 66 43Q80 52 65 66L32 65L17 57Z", C.leaf);
  p.path("M16 46Q17 32 34 33L43 48L34 60L15 56Z", C.moss);
  p.oval(23, 35, 5, 6, C.gold);
  p.eye(22, 34, 2.4);
  p.line("M15 52Q26 58 37 54", C.cream, 2);
  p.line("M55 55L72 60L63 72", C.mint, 2);
  for (const [x, y] of [
    [44, 43],
    [55, 46],
    [64, 51],
    [48, 52],
  ])
    p.oval(x, y, 3, 2, C.pine, 0, false);
});
function turtle(p: Ink, tortoise = false): void {
  p.shadow(81, 35);
  p.path(
    tortoise
      ? "M36 59L28 81L38 81L46 64M67 58L77 80L87 80L77 57Z"
      : "M37 60L19 81L35 78L47 62M64 62L81 82L88 80L76 60Z",
    C.moss,
  );
  p.path("M29 53L13 47Q0 43 5 57Q11 65 29 60M76 54L96 64L82 66Z", C.leaf);
  p.path("M23 59Q21 25 54 25Q82 26 86 60Q53 82 23 59Z", C.brown);
  p.path("M29 51Q32 29 55 30Q73 30 80 51Q55 63 29 51Z", C.moss);
  p.line(
    "M47 31L39 44L47 58L64 57L71 43L62 31M39 44L28 49M47 58L44 68M64 57L72 64M71 43L80 48",
    C.sand,
    1.6,
  );
  p.eye(11, 52, 1.7);
}
add("turtle", "Swimming turtle", "Reptiles & small animals", (p) => turtle(p));
add("tortoise", "Tortoise", "Reptiles & small animals", (p) => turtle(p, true));
function lizard(
  p: Ink,
  kind: "herb" | "ambush" | "climber" | "forager" | "croc",
): void {
  const croc = kind === "croc",
    climb = kind === "climber",
    herb = kind === "herb";
  const color = herb
    ? C.leaf
    : climb
      ? C.pine
      : kind === "forager"
        ? C.gold
        : C.moss;
  p.shadow(82, 36);
  p.path(
    climb
      ? "M63 54Q96 74 87 38Q84 19 72 29Q72 35 80 34Q69 45 64 29Q85 7 96 35Q109 82 65 69Z"
      : "M64 51Q86 61 98 37Q96 78 64 65Z",
    color,
  );
  p.path(
    "M39 48L31 61L21 65L18 62L25 57L27 48M62 57L77 76L89 77L87 82L70 83L54 62M31 57L24 76L10 76L10 81L30 83L42 63Z",
    tintHex(color, -15),
  );
  p.path(
    herb
      ? "M23 43Q40 25 65 42Q81 62 58 68L27 63Z"
      : "M24 44Q46 36 68 49L76 60Q52 74 25 60Z",
    color,
  );
  p.path(
    croc
      ? "M34 44L10 43L3 51L7 58L35 60Z"
      : herb
        ? "M32 43Q23 30 12 39L8 52L20 61L36 55Z"
        : "M31 45L12 40L5 49L11 57L33 58Z",
    color,
  );
  p.flat("M13 54L31 54Q54 65 70 58L62 66L33 64Z", "#d6ce9b88");
  p.eye(19, 45, 1.8);
  if (herb) {
    for (let i = 0; i < 7; i++)
      p.path(`M${30 + i * 5} ${37 + i * 0.3}l3 -8l4 9Z`, C.pine, false);
  }
  if (climb) {
    p.oval(19, 44, 4, 5, C.gold);
    p.eye(18, 44, 2);
    for (const [x, y] of [
      [20, 63],
      [84, 79],
      [15, 79],
    ])
      p.line(`M${x} ${y}l-5 -4m5 4l-6 2m6 -2l-1 6`, C.mint, 1.5);
  } else if (croc) {
    for (let i = 0; i < 8; i++) {
      const x = 32 + i * 6;
      p.path(`M${x} 46l2 -6l4 8Z`, C.pine, false);
      p.line(`M${x} 52l3 3l-3 3`, C.sand, 1);
    }
    p.line("M7 54l3 -2l3 3l3 -2l3 3l3 -2", C.cream, 1.2);
  } else
    for (const [x, y] of [
      [38, 47],
      [46, 52],
      [56, 48],
      [63, 55],
    ])
      p.oval(x, y, 3, 2, C.pine, 0, false);
}
add("herb-lizard", "Plant-eating lizard", "Reptiles & small animals", (p) =>
  lizard(p, "herb"),
);
add("ambush-lizard", "Ambush lizard", "Reptiles & small animals", (p) =>
  lizard(p, "ambush"),
);
add("climbing-lizard", "Climbing lizard", "Reptiles & small animals", (p) =>
  lizard(p, "climber"),
);
add("foraging-lizard", "Foraging lizard", "Reptiles & small animals", (p) =>
  lizard(p, "forager"),
);
add("crocodile", "Crocodile", "Reptiles & small animals", (p) =>
  lizard(p, "croc"),
);
add("snake", "Snake", "Reptiles & small animals", (p) => {
  p.shadow(85, 34);
  p.path(
    "M89 80Q63 98 37 83Q9 68 30 53Q47 44 69 58Q92 70 79 44L61 29L54 42Q70 50 66 60Q51 53 37 62Q25 72 47 77Q72 88 89 80Z",
    C.moss,
  );
  p.path("M58 43Q41 46 39 32Q45 18 62 23L71 32L64 43Z", C.leaf);
  p.line("M41 34L29 35L25 31M29 35L25 39", C.rust, 1.6);
  p.eye(49, 29, 1.7);
  p.line("M73 41Q97 78 66 69Q30 51 26 69Q26 83 69 86", C.sand, 2);
  for (let i = 0; i < 5; i++)
    p.line(`M${36 + i * 9} ${71 + i * 2}l-4 7`, C.pine, 2);
});

// ------------------------------------------------------------------- flyers
function bird(p: Ink, raptor = false): void {
  p.path(
    raptor
      ? "M46 50L27 15L6 8L10 24L4 21L12 38L7 37L20 49L16 50L41 61Z"
      : "M45 51Q27 18 5 22L15 37L12 38L23 48L22 51L41 63Z",
    raptor ? C.brown : C.slate,
  );
  p.path(
    raptor
      ? "M55 50L73 15L95 8L90 24L97 21L88 38L95 36L81 49L84 51L60 61Z"
      : "M55 50Q78 19 96 25L84 39L88 40L77 50L79 53L60 63Z",
    raptor ? C.brown : C.slate,
  );
  for (let i = 0; i < 4; i++) {
    p.line(`M${15 + i * 6} ${27 + i * 7}L43 58`, C.sand, 0.9);
    p.line(`M${86 - i * 6} ${27 + i * 7}L58 58`, C.sand, 0.9);
  }
  p.path("M43 62L39 88L50 82L59 88L57 61Z", raptor ? C.dark : C.blue);
  p.oval(50, 57, 10, 23, raptor ? C.gold : C.rust);
  p.oval(48, 33, 9, 10, raptor ? C.cream : C.blue);
  p.path(
    raptor ? "M41 33L30 36L33 43L36 38L42 38Z" : "M40 33L28 37L40 39Z",
    C.gold,
  );
  p.eye(44, 31, 1.7);
  p.line("M45 57L43 70M51 53L49 72", C.cream, 1.2);
}
add("bird", "Seed-eating bird", "Birds & bats", (p) => bird(p));
add("raptor-bird", "Bird of prey", "Birds & bats", (p) => bird(p, true));
add("bat", "Bat", "Birds & bats", (p) => {
  p.path(
    "M45 45L19 12L7 27L5 57Q18 44 27 63Q36 53 45 72L50 63L56 72Q64 52 75 63Q82 44 96 57L92 26L80 12L56 44Z",
    C.plum,
  );
  p.line(
    "M48 55L19 14L26 58M48 55L8 28L8 51M53 55L81 14L75 58M53 55L92 27L93 51",
    C.dark,
    1.7,
  );
  p.path("M43 42L39 21L48 30L55 29L63 21L58 45Z", C.brown);
  p.oval(50, 55, 8, 19, C.brown);
  p.oval(50, 40, 9, 8, C.dark);
  p.eye(46, 38, 1.2);
  p.eye(55, 38, 1.2);
});

// ------------------------------------------------------------------ mammals
/** Shared anatomy, not a shared silhouette: each body, head and tail is authored below. */
function legs(p: Ink, points: number[], color: string, slim = false): void {
  for (let i = points.length - 1; i >= 0; i--) {
    const x = points[i],
      far = i % 2 === 1,
      w = slim ? 4 : 7;
    p.path(
      `M${x - w / 2} 58L${x + w} 62L${x + 3} 77L${x + 6} 89L${x - 3} 89L${x - 4} 77Z`,
      far ? tintHex(color, -24) : color,
    );
    p.line(`M${x - 3} 87h8`, C.dark, 2);
  }
}
function grazer(p: Ink, kind: "longhorn" | "goat" | "horse" | "cow"): void {
  const goat = kind === "goat",
    horse = kind === "horse",
    c = goat ? C.sand : horse ? C.rust : C.brown;
  p.shadow(92, 36);
  legs(p, [31, 42, 66, 76], c, horse || goat);
  p.path("M73 43Q89 42 84 70L90 76L85 80Q77 74 79 62L76 50Z", c);
  p.path(
    goat
      ? "M25 42Q51 31 75 43L79 62Q53 77 28 63Z"
      : "M23 39Q46 30 73 40Q84 48 77 64Q48 75 23 61Z",
    c,
  );
  p.path(
    horse
      ? "M29 55L39 25L31 14L23 25L18 37L8 45L11 56L25 55Z"
      : "M30 38L20 31L11 39L7 55L17 66L27 61L36 48Z",
    c,
  );
  if (horse) {
    p.path("M33 18L42 27L36 48L31 51L35 28L26 25Z", C.dark);
    p.path("M26 23L23 10L30 16L32 24Z", c);
    p.line("M77 49Q86 66 82 78", C.dark, 4);
  } else {
    p.path("M20 35L8 28L8 37L16 42M28 36L39 29L38 39L30 44Z", c);
  }
  if (kind === "longhorn") {
    p.path(
      "M16 37Q-1 27 7 9Q4 27 22 30ZM26 34Q45 24 39 9Q49 27 30 38Z",
      C.cream,
    );
  }
  if (goat) {
    p.path(
      "M20 33Q14 12 28 8Q20 19 25 32M28 33Q25 13 37 12Q31 23 33 33Z",
      C.gold,
    );
    p.path("M12 59L24 59L20 76L14 69Z", C.cream);
  }
  if (kind === "cow") {
    p.path(
      "M38 38Q59 31 56 47L45 58L33 52ZM68 45Q81 47 73 62L62 62Z",
      C.cream,
      false,
    );
    p.line("M16 34L13 24M27 34L31 25", C.cream, 3);
  }
  p.oval(horse ? 13 : 14, 55, 7, 5, C.sand);
  p.eye(horse ? 23 : 19, 42, 1.6);
  p.line("M37 43Q50 35 66 42", "#e1c79770", 1.6);
}
add("longhorn", "Long-horned grazer", "Mammals", (p) => grazer(p, "longhorn"));
add("horned-grazer", "Horned grazer", "Mammals", (p) => grazer(p, "goat"));
add("horse", "Horse", "Mammals", (p) => grazer(p, "horse"));
add("cow", "Grazing beast", "Mammals", (p) => grazer(p, "cow"));
function elephant(p: Ink, mammoth = false): void {
  p.shadow(93, 38);
  const c = mammoth ? C.brown : C.slate;
  legs(p, [34, 46, 66, 78], c);
  p.path("M75 40Q91 40 92 67", c);
  p.path(
    mammoth
      ? "M24 43Q32 12 57 27Q89 25 87 57L82 77L77 72L70 79L63 73L57 80L49 73L39 78L28 66Z"
      : "M24 42Q40 22 67 31Q88 34 86 63Q74 81 40 72L25 65Z",
    c,
  );
  p.path(
    "M30 33Q6 26 9 52L10 77Q6 87 17 91Q26 93 28 83L24 80Q20 87 18 80L23 56L37 55Z",
    c,
  );
  p.path(
    mammoth
      ? "M30 37Q46 27 45 51L34 65L24 54Z"
      : "M33 35Q57 25 49 54L37 67L24 51Z",
    mammoth ? C.rust : tintHex(c, 17),
  );
  p.path(
    "M18 58Q-1 79 8 82Q24 84 27 66L24 66Q20 78 13 76Q8 73 21 61Z",
    C.cream,
  );
  p.eye(17, 44, 1.7);
  if (mammoth)
    for (let i = 0; i < 9; i++)
      p.line(`M${39 + i * 5} 42l-2 ${15 + (i % 3) * 4}`, C.sand, 1);
  else p.line("M42 39Q36 45 39 57M52 65L75 65", C.mint, 1.1);
}
add("elephant", "Elephant", "Mammals", (p) => elephant(p));
add("mammoth", "Mammoth", "Mammals", (p) => elephant(p, true));
function rodent(p: Ink, rat = false): void {
  const c = rat ? C.brown : C.sand;
  p.shadow(86, 33);
  p.line("M69 67Q91 77 97 57Q100 42 87 43", C.clay, 3.5);
  legs(p, [33, 56, 68], c);
  p.path("M24 61Q29 35 59 39Q85 42 77 67Q69 80 32 74Z", c);
  p.path("M37 53Q27 40 16 51L4 64L16 70L39 69Z", c);
  p.oval(31, 44, 7, 9, c, -0.4);
  p.oval(31, 44, 4, 6, C.clay, -0.4, false);
  p.eye(21, 58, 1.8);
  p.dot(6, 64, 2, C.dark);
  p.line("M12 64L2 60M13 67L2 70", C.cream, 1);
  p.line("M43 48Q60 38 72 50", "#e4d6b488", 1.5);
}
add("rodent", "Small gnawer", "Mammals", (p) => rodent(p));
add("rat", "Rat", "Mammals", (p) => rodent(p, true));
function predator(
  p: Ink,
  kind: "wolf" | "cheetah" | "cat" | "tiger" | "fox",
): void {
  const wolf = kind === "wolf",
    fox = kind === "fox",
    cat = kind === "cat",
    tiger = kind === "tiger";
  const c = wolf
    ? C.slate
    : fox
      ? C.rust
      : cat
        ? C.sand
        : tiger
          ? C.gold
          : "#c3a768";
  p.shadow(92, 38);
  legs(p, [30, 40, 66, 77], c, !tiger);
  p.path(
    fox
      ? "M72 45Q98 35 96 61Q88 79 75 62Q93 65 87 50Z"
      : wolf
        ? "M73 47Q96 49 96 70L82 64L73 54Z"
        : "M76 45Q100 32 91 17Q85 9 82 20Q91 22 88 32L76 39Z",
    c,
  );
  if (fox) p.path("M86 65Q98 59 96 50L91 53L87 49L88 59Z", C.cream, false);
  p.path(
    tiger
      ? "M25 43Q48 28 75 41Q86 51 77 65Q56 76 27 64Z"
      : kind === "cheetah"
        ? "M25 43Q43 32 61 42L78 39Q86 52 74 62L55 60L37 67L23 62Z"
        : "M25 43Q48 34 75 43Q84 52 76 64L29 67Z",
    c,
  );
  p.path(
    wolf || fox
      ? "M30 44L23 27L15 36L8 33L11 46L3 53L16 63L33 59Z"
      : "M30 43L25 31L18 36L10 32L10 47Q4 59 18 64L33 58Z",
    c,
  );
  p.path(
    wolf || fox
      ? "M6 51L18 54L25 46L26 60L17 63Z"
      : "M9 54Q19 49 28 55L25 62L14 62Z",
    C.cream,
    false,
  );
  p.eye(17, 45, 1.6);
  p.dot(7, 53, 1.8, C.dark);
  p.line("M38 45Q56 36 70 45", "#e9dfbd77", 1.4);
  if (wolf)
    p.path("M28 38L36 46L30 47L36 54L29 54L33 62L23 62Z", C.dark, false);
  if (tiger)
    for (let i = 0; i < 7; i++) {
      const x = 33 + i * 6;
      p.path(`M${x} 40l4 2l-3 14l-3 4l2 -13Z`, C.dark, false);
    }
  if (kind === "cheetah") {
    for (let i = 0; i < 18; i++)
      p.dot(33 + ((i * 11) % 42), 44 + ((i * 7) % 17), 1.5, C.dark);
    p.line("M17 47L13 55", C.dark, 1.4);
  }
  if (cat) {
    p.line("M15 57L2 56M17 59L4 63", C.brown, 0.9);
    p.path("M43 41L49 40L47 53L43 54Z", C.brown, false);
  }
}
add("wolf", "Wolf", "Mammals", (p) => predator(p, "wolf"));
add("cheetah", "Cheetah", "Mammals", (p) => predator(p, "cheetah"));
add("cat", "Climbing cat", "Mammals", (p) => predator(p, "cat"));
add("tiger", "Tiger", "Mammals", (p) => predator(p, "tiger"));
add("fox", "Fox", "Mammals", (p) => predator(p, "fox"));
add("bear", "Bear", "Mammals", (p) => {
  p.shadow(93, 36);
  legs(p, [31, 42, 64, 78], C.brown);
  p.path("M21 44Q35 20 53 27Q83 21 88 50Q93 76 69 76L30 71Z", C.brown);
  p.oval(22, 47, 16, 15, C.brown);
  p.oval(19, 32, 5, 6, C.dark);
  p.oval(31, 33, 5, 6, C.brown);
  p.oval(12, 53, 10, 7, C.sand);
  p.eye(20, 43, 1.7);
  p.dot(5, 51, 2.5, C.dark);
  p.line("M37 40Q57 29 73 39M33 64l4 7m4 -8l4 7", C.sand, 1.4);
});
add("boar", "Wild boar", "Mammals", (p) => {
  p.shadow(92, 37);
  legs(p, [35, 45, 66, 79], C.brown);
  p.line("M80 45q17 -9 14 3q-6 7 -8 -1", C.brown, 2.5);
  p.path(
    "M22 44L31 31L37 35L40 28L47 32L55 28Q83 28 87 55Q89 74 57 74L29 66Z",
    C.brown,
  );
  p.path("M33 44L23 33L17 42L12 51L3 61L10 71L27 64L38 54Z", C.brown);
  p.oval(9, 64, 7, 6, C.clay);
  p.path("M16 62Q16 77 29 59Q26 79 14 71Z", C.cream);
  p.eye(24, 48, 1.6);
  for (let i = 0; i < 8; i++) p.line(`M${38 + i * 5} 40l-3 14`, C.sand, 0.9);
});
function primate(
  p: Ink,
  kind: "sloth" | "gorilla" | "monkey" | "toolmaker",
): void {
  const sloth = kind === "sloth",
    gorilla = kind === "gorilla",
    human = kind === "toolmaker",
    c = gorilla ? C.dark : sloth ? C.sand : C.brown;
  p.shadow(94, 27);
  if (sloth) {
    p.line("M6 20Q46 33 95 18", C.brown, 6);
    p.path(
      "M30 58Q15 43 24 23L32 26L30 43L42 52M61 62Q80 46 74 25L83 22Q94 48 71 76Z",
      c,
    );
    p.oval(50, 61, 24, 17, c, 0.4);
    p.oval(29, 56, 14, 12, c);
    p.oval(25, 55, 9, 8, C.cream);
    p.line("M18 52L24 56M29 52L25 57", C.brown, 3);
    p.eye(22, 54, 1.1);
    p.line("M24 24l-2 -6m7 6l-1 -6M77 25l-2 -6m7 4l-1 -6", C.cream, 1.6);
    return;
  }
  if (kind === "monkey")
    p.line("M61 62Q86 83 90 50Q96 23 78 28Q73 34 82 36", c, 5);
  p.path(
    human
      ? "M41 59L50 62L44 83L42 94L31 94L36 81ZM54 62L63 60L63 83L71 94L59 94L54 81Z"
      : "M36 58L48 64L42 84L46 93L30 93L29 77M56 61L67 57L72 80L79 91L63 93L59 78Z",
    c,
  );
  p.path(
    gorilla
      ? "M28 38Q45 24 63 32L75 54L64 73L38 73L23 51Z"
      : "M39 35L58 34L66 56L59 73L38 69L31 52Z",
    c,
  );
  p.path(
    human
      ? "M35 39L39 48L29 61L16 55L19 49L27 51ZM59 39L67 45L76 58L84 54L89 58L75 67L60 52Z"
      : gorilla
        ? "M31 37Q9 46 9 83L7 92L23 93L27 63L37 51M63 34Q83 42 87 82L94 90L79 93L66 58Z"
        : "M36 40L24 59L21 80L13 82L13 88L27 87L33 67L44 48M58 40L72 59L74 80L81 85L73 91L67 84L61 65L51 48Z",
    c,
  );
  p.oval(47, 27, human ? 10 : 14, human ? 13 : 15, c);
  p.path("M37 24Q46 16 57 24L55 38Q46 44 38 34Z", gorilla ? C.slate : C.sand);
  p.eye(41, 27, 1.3);
  p.eye(52, 27, 1.3);
  p.line("M44 36L50 36", C.ink, 1);
  if (human) {
    p.path("M36 58L61 58L65 74L51 70L42 76L34 70Z", C.rust);
    p.line("M84 82L82 23", C.brown, 3);
    p.path("M82 14L75 28L84 33L88 25Z", C.slate);
    p.line("M78 31L87 34M78 34L87 37", C.sand, 1.2);
  } else
    p.path(
      "M42 45Q48 40 56 46L59 62L44 64Z",
      gorilla ? C.slate : C.sand,
      false,
    );
}
add("sloth", "Sloth", "Mammals", (p) => primate(p, "sloth"));
add("gorilla", "Gorilla", "Mammals", (p) => primate(p, "gorilla"));
add("monkey", "Monkey", "Mammals", (p) => primate(p, "monkey"));
add("toolmaker", "Self-aware toolmaker", "Mammals", (p) =>
  primate(p, "toolmaker"),
);

// ---------------------------------------------------------------- dinosaurs
add("sauropod", "Long-necked dinosaur", "Dinosaurs", (p) => {
  p.shadow(93, 38);
  legs(p, [39, 48, 65, 74], C.moss);
  p.path("M67 46Q87 53 99 32Q98 64 73 66Z", C.moss);
  p.path(
    "M29 52Q44 32 70 45Q82 52 75 67Q52 79 32 65Q19 57 19 24L9 22L7 14Q22 4 29 20Q24 39 29 52Z",
    C.moss,
  );
  p.flat("M18 22Q16 52 35 65L34 71Q16 65 14 23Z", "#cfcea17f");
  p.eye(15, 15, 1.4);
  p.line("M39 46Q57 37 70 49", C.mint, 1.7);
  for (let i = 0; i < 5; i++) p.oval(40 + i * 6, 55, 2, 3, C.pine, 0, false);
});
add("shield-lizard", "Horned shield-lizard", "Dinosaurs", (p) => {
  p.shadow(93, 37);
  legs(p, [35, 45, 64, 77], C.moss);
  p.path("M72 48L98 60L80 65Z", C.pine);
  p.path("M26 43Q43 28 72 40Q90 54 77 70L31 70Z", C.moss);
  p.path("M33 33L44 38L42 46L47 51L39 57L40 67L29 69L16 56L17 41Z", C.pine);
  p.path("M29 43L16 44L5 57L10 66L25 62L38 56Z", C.leaf);
  p.path("M16 48L15 27L22 47M26 44L32 26L31 48M8 57L4 44L15 54Z", C.cream);
  p.eye(24, 51, 1.7);
  p.line("M45 43Q60 34 76 47", C.mint, 1.7);
});
function dinosaur(p: Ink, swift = false): void {
  p.shadow(94, 35);
  const c = swift ? C.gold : C.moss;
  p.path("M62 47Q84 56 99 30Q97 68 63 65Z", c);
  p.path(
    "M48 57L64 58L64 76L76 92L58 92L50 79L44 72M35 57L45 63L40 80L47 93L30 93L29 77Z",
    tintHex(c, -12),
  );
  p.path("M27 34Q37 36 47 41Q69 34 70 53Q72 70 43 70L30 50Z", c);
  p.path(
    swift
      ? "M30 28L9 31L4 42L24 44L37 39Z"
      : "M33 23L11 22L4 30L5 45L23 50L37 38Z",
    c,
  );
  p.path("M33 46L25 59L16 60L15 65L29 65L41 53Z", c);
  p.line("M8 40L25 40L30 34", C.ink, 1.5);
  p.line("M9 40l3 4l3 -4l3 4l3 -4", C.cream, 1.3);
  p.eye(24, 30, 1.6);
  p.line("M39 46Q51 38 60 46", C.mint, 1.7);
  if (swift) {
    for (let i = 0; i < 6; i++)
      p.line(`M${39 + i * 6} ${43 + i * 0.8}l-4 10`, C.brown, 2);
    p.path("M24 23L25 14L33 26Z", C.rust);
  }
}
add("tyrant", "Tyrant dinosaur", "Dinosaurs", (p) => dinosaur(p));
add("swift-raptor", "Swift raptor", "Dinosaurs", (p) => dinosaur(p, true));

// ---------------------------------------------------------------- landscape
function mountain(p: Ink, snow = false, volcano = false): void {
  p.shadow(92, 43);
  p.path(
    volcano
      ? "M3 91L29 65L40 32L61 30L77 69L97 91Z"
      : "M3 91L32 36L43 49L61 10L97 91Z",
    C.slate,
  );
  p.path(
    volcano
      ? "M4 89L29 65L40 33L45 38L38 65L51 60L41 88Z"
      : "M4 90L32 36L26 69L39 61L32 88M33 90L61 11L52 50L61 44L51 89Z",
    C.sand,
    false,
  );
  p.path(
    volcano
      ? "M61 31L77 69L97 91L70 85L60 53L52 43Z"
      : "M61 11L97 91L74 77L70 82L61 57L52 50Z",
    C.blue,
    false,
  );
  p.line("M31 54L20 80M55 60L47 82M67 57L80 85M29 86L39 76", "#d0d4b37d", 1.4);
  if (snow) {
    p.path("M61 10L77 42L67 37L61 44L54 35L46 45Z", C.cream);
    p.path("M32 36L43 49L36 46L31 54L26 48Z", C.mint);
  }
  if (volcano) {
    p.oval(51, 34, 12, 5, C.dark);
    p.oval(51, 34, 8, 3, "#e69954");
    p.path("M47 36L44 55L54 64L55 77L68 89L62 69L51 54L55 37Z", C.rust, false);
    p.line("M50 38L48 54L57 65L59 77", "#f1c06e", 2);
    p.oval(51, 19, 8, 8, "#a2a79e", 0, false);
    p.oval(60, 11, 13, 7, "#b8b9a7", 0, false);
  }
}
add("mountain", "Mountain", "Landscape", (p) => mountain(p));
add("snow-mountain", "Snow mountain", "Landscape", (p) => mountain(p, true));
add("volcano", "Volcano", "Landscape", (p) => mountain(p, false, true));
add("fire", "Fire", "Landscape", (p) => {
  p.shadow(93, 29);
  p.line("M20 90L78 84M28 83L72 94", C.brown, 5);
  p.path(
    "M25 85Q9 65 27 44Q27 61 37 54Q27 31 52 8Q43 34 62 45Q72 35 68 26Q96 56 78 82Q63 98 44 91Z",
    C.rust,
  );
  p.path(
    "M32 83Q22 70 42 51Q43 65 50 58Q53 37 61 38Q78 62 69 81Q53 97 32 83Z",
    "#dfab58",
    false,
  );
  p.path("M42 83Q35 72 49 64Q53 74 59 63Q67 85 53 88Z", C.cream, false);
  p.dot(33, 28, 2, C.gold);
  p.dot(73, 15, 2.4, C.rust);
});

/** Stable atlas keys keep ecologically different forms separate in the bitmap cache. */
const ICON_KEYS: Record<string, string> = {
  "🌲": "conifer",
  "🌳": "broadleaf",
  "🌴": "palm",
  "🌿": "fern",
  "🌱": "moss",
  "⛰️": "mountain",
  "🏔️": "snow-mountain",
  "🦠": "bacterium",
  "🟢": "alga",
  "🧫": "protist",
  "🟩": "algal-mat",
  "🟫": "lichen",
  "🪸": "coral",
  "🪷": "waterlily",
  "🎋": "horsetail",
  "🌾": "grass",
  "🌼": "flower",
  "🌵": "cactus",
  "🧽": "sponge",
  "🪼": "jelly",
  "🦞": "sea-scorpion",
  "🐚": "mollusc",
  "🦀": "crab",
  "🦐": "shrimp",
  "🦑": "squid",
  "🐙": "octopus",
  "🐋": "whale",
  "🦭": "seal",
  "🐡": "armored-fish",
  "🦦": "otter",
  "🐟": "predatory-fish",
  "🐠": "grazing-fish",
  "🦈": "shark",
  "🪰": "dragonfly",
  "🦋": "butterfly",
  "🐜": "ant",
  "🦂": "scorpion",
  "🪲": "beetle",
  "🕷️": "spider",
  "🐛": "millipede",
  "🐸": "frog",
  "🐢": "turtle",
  "🦎": "herb-lizard",
  "🐊": "crocodile",
  "🐌": "snail",
  "🪱": "worm",
  "🐦": "bird",
  "🦅": "raptor-bird",
  "🦇": "bat",
  "🐂": "longhorn",
  "🐐": "horned-grazer",
  "🦥": "sloth",
  "🦣": "mammoth",
  "🐘": "elephant",
  "🐎": "horse",
  "🐁": "rodent",
  "🐄": "cow",
  "🐺": "wolf",
  "🐆": "cheetah",
  "🐈": "cat",
  "🐅": "tiger",
  "🦊": "fox",
  "🦍": "gorilla",
  "🐒": "monkey",
  "🐻": "bear",
  "🐀": "rat",
  "🐗": "boar",
  "🦕": "sauropod",
  "🦏": "shield-lizard",
  "🦖": "tyrant",
  "🐍": "snake",
  "🧑": "toolmaker",
  "🔥": "fire",
  "🌋": "volcano",
};
export function landscapeSpriteKey(icon: string, g?: Genome): string {
  if (g) {
    if (icon === "🌿")
      return g.habitat === "aquatic"
        ? g.size > 3
          ? "kelp"
          : "seagrass"
        : g.tier >= 4
          ? "shrub"
          : "fern";
    if (icon === "🌴") return g.tier === 3 ? "tree-fern" : "palm";
    if (icon === "🦎")
      return g.diet === "herb"
        ? "herb-lizard"
        : g.diet === "carn"
          ? "ambush-lizard"
          : g.grasp > 0.5
            ? "climbing-lizard"
            : "foraging-lizard";
    if (icon === "🐟")
      return g.diet === "carn" ? "predatory-fish" : "shoaling-fish";
    if (icon === "🐠")
      return g.diet === "omni" ? "foraging-fish" : "grazing-fish";
    if (icon === "🦭") return g.diet === "herb" ? "manatee" : "seal";
    if (icon === "🐢")
      return g.habitat === "terrestrial" ? "tortoise" : "turtle";
    if (icon === "🦖") return g.size >= 8 ? "tyrant" : "swift-raptor";
  }
  return ICON_KEYS[icon] ?? icon;
}
const drawings = new Map(entries.map((e) => [e.key, e.draw]));
/** Used by the contact sheet and coverage checks; does not construct Canvas objects on import. */
export const LANDSCAPE_SPRITES = entries.map(({ key, label, group }) => ({
  key,
  label,
  group,
}));
export function paintLandscapeSprite(
  ctx: CanvasRenderingContext2D,
  iconOrKey: string,
  canvasSize: number,
  size: number,
): boolean {
  const draw = drawings.get(landscapeSpriteKey(iconOrKey));
  if (!draw) return false;
  ctx.save();
  try {
    ctx.translate((canvasSize - size) / 2, (canvasSize - size) / 2);
    ctx.scale(size / 100, size / 100);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    draw(new Ink(ctx));
  } finally {
    ctx.restore();
  }
  return true;
}
