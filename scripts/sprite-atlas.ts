import { LANDSCAPE_SPRITES, paintLandscapeSprite } from "../src/ui/landscape";

// Development contact sheet: exercises the actual painter, without touching a game or its RNG.
const main = document.querySelector("main")!;
const nav = document.querySelector("nav")!;
const groups = [...new Set(LANDSCAPE_SPRITES.map((s) => s.group))];
let failures: string[] = [],
  totalPixels = 0;
function canvas(key: string, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.setAttribute("aria-label", `${key} at ${size}px`);
  if (!paintLandscapeSprite(c.getContext("2d")!, key, size, size * 0.92))
    failures.push(`${key}: missing`);
  return c;
}
for (const group of groups) {
  const section = document.createElement("section");
  section.dataset.group = group;
  const heading = document.createElement("h2");
  heading.textContent = group;
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const s of LANDSCAPE_SPRITES.filter((s) => s.group === group)) {
    const card = document.createElement("article");
    card.dataset.key = s.key;
    if (group === "Sea life" || group === "Microbes & mats")
      card.className = "sea";
    const big = canvas(s.key, 160),
      ctx = big.getContext("2d")!;
    const a = ctx.getImageData(0, 0, 160, 160).data;
    const b = canvas(s.key, 160)
      .getContext("2d")!
      .getImageData(0, 0, 160, 160).data;
    let opaque = 0,
      border = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] > 8) {
        opaque++;
        const x = (i >> 2) % 160,
          y = Math.floor((i >> 2) / 160);
        if (x === 0 || y === 0 || x === 159 || y === 159) border++;
      }
    }
    if (opaque < 100) failures.push(`${s.key}: empty drawing`);
    if (border > 0) failures.push(`${s.key}: edge clipping`);
    if (a.some((v, i) => v !== b[i]))
      failures.push(`${s.key}: nondeterministic`);
    totalPixels += opaque;
    const title = document.createElement("h3");
    title.textContent = s.label;
    const sizes = document.createElement("div");
    sizes.className = "sizes";
    for (const px of [16, 24, 40]) sizes.append(canvas(s.key, px));
    const label = document.createElement("div");
    label.className = "scale";
    label.textContent = "16 · 24 · 40 px";
    card.append(big, title, sizes, label);
    grid.append(card);
  }
  section.append(heading, grid);
  main.append(section);
}
for (const group of ["All", ...groups]) {
  const button = document.createElement("button");
  button.textContent = group;
  button.setAttribute("aria-pressed", String(group === "All"));
  button.onclick = () => {
    for (const section of main.querySelectorAll("section"))
      section.hidden = group !== "All" && section.dataset.group !== group;
    for (const b of nav.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b === button));
  };
  nav.append(button);
}
document.querySelector("#checks")!.textContent = failures.length
  ? `CHECK FAILED: ${failures.join("; ")}`
  : `${LANDSCAPE_SPRITES.length} drawings · all render · transparent edges · deterministic · ${totalPixels.toLocaleString("en")} painted pixels checked`;
