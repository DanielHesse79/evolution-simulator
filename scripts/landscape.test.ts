import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landscapeSpriteKey, LANDSCAPE_SPRITES } from "../src/ui/landscape";
import { describe, formatMass, hasHumanoidBody, massKg, SENTIENCE, type Genome } from "../src/sim/genome";
import { portrait } from "../src/ui/portrait";
import { Sim } from "../src/sim/simulation";

const keys = new Set(LANDSCAPE_SPRITES.map((s) => s.key));
test("every icon emitted by describe has bespoke landscape art, including terrain events", () => {
  const source = readFileSync(
    new URL("../src/sim/genome.ts", import.meta.url),
    "utf8",
  );
  const descriptions = source.slice(
    source.indexOf("export function describe("),
    source.indexOf("const SYL_A"),
  );
  const icons = [
    ...descriptions.matchAll(/'([\p{Extended_Pictographic}\uFE0F]+)'/gu),
  ].map((m) => m[1]);
  assert.ok(
    new Set(icons).size >= 60,
    "coverage must include the full body-plan vocabulary",
  );
  for (const icon of [...icons, "🔥", "🌋", "⛰️", "🏔️"])
    assert.ok(
      keys.has(landscapeSpriteKey(icon)),
      `Missing illustration for ${icon}`,
    );
  assert.equal(
    keys.size,
    LANDSCAPE_SPRITES.length,
    "no duplicate illustration keys",
  );
});

const seed = new Sim(12, "sandbox").alive[0].genome;
function body(patch: Partial<Genome>): Genome {
  return {
    ...seed,
    tier: 4,
    diet: "herb",
    habitat: "terrestrial",
    size: 5,
    fur: 0,
    grasp: 0,
    flight: 0,
    armor: 0,
    horns: 0,
    social: 0,
    intel: 0,
    toxin: 0,
    speed: 0,
    ...patch,
  };
}
const keyFor = (g: Genome) => landscapeSpriteKey(describe(g).icon, g);
test("shared fish and lizard icons retain ecologically distinct cached artwork", () => {
  const examples: [Partial<Genome>, string][] = [
    [{ habitat: "aquatic" }, "grazing-fish"],
    [{ habitat: "aquatic", diet: "carn" }, "predatory-fish"],
    [{ habitat: "aquatic", diet: "carn", size: 7 }, "shark"],
    [{ habitat: "aquatic", social: 0.8 }, "shoaling-fish"],
    [{ habitat: "aquatic", diet: "omni" }, "foraging-fish"],
    [{}, "herb-lizard"],
    [{ diet: "carn" }, "ambush-lizard"],
    [{ diet: "omni", grasp: 0.8 }, "climbing-lizard"],
    [{ diet: "omni" }, "foraging-lizard"],
    [{ habitat: "aquatic", fur: 0.8 }, "manatee"],
    [{ habitat: "aquatic", fur: 0.8, diet: "carn" }, "seal"],
    [{ diet: "carn", speed: 0.7 }, "swift-raptor"],
    [{ diet: "carn", size: 9 }, "tyrant"],
  ];
  for (const [g, expected] of examples) assert.equal(keyFor(body(g)), expected);
});
test("plant variants use habitat and body plan without altering the genome", () => {
  const cases: [Partial<Genome>, string][] = [
    [{ tier: 3, size: 2 }, "fern"],
    [{ tier: 4, size: 4 }, "shrub"],
    [{ tier: 3, size: 6 }, "tree-fern"],
    [{ tier: 4, size: 6, tempOpt: 30, moistOpt: 0.9 }, "palm"],
    [{ habitat: "aquatic", size: 4 }, "kelp"],
    [{ tier: 3, habitat: "aquatic", size: 2 }, "seagrass"],
  ];
  for (const [patch, expected] of cases) {
    const g = body({ diet: "photo", moistOpt: 0.7, ...patch }),
      before = { ...g };
    assert.equal(keyFor(g), expected);
    assert.deepEqual(g, before);
  }
});

const sizeForKg = (kg: number) => (Math.log10(kg) + 11) / 1.6;
const intelligent = (patch: Partial<Genome> = {}) => body({
  diet: 'omni', size: sizeForKg(70), fur: .7, grasp: .8, social: .8, intel: SENTIENCE, ...patch,
});
test('a 1.8-tonne self-aware animal keeps its large body, weight and intelligence', () => {
  const g = intelligent({ size: sizeForKg(1800) }), before = { ...g };
  assert.equal(formatMass(g.size), '1.8 t');
  assert.equal(describe(g).desc, 'Self-aware giant bear-like forager');
  assert.equal(keyFor(g), 'bear');
  assert.equal(hasHumanoidBody(g), false);
  assert.doesNotMatch(portrait(g, 30, 1), /M136,10 L132,120/); // upright figure's held spear
  assert.ok(Math.abs(massKg(g.size) - 1800) < .00001);
  assert.deepEqual(g, before);
});
test('human art requires appropriate mass and anatomy; other self-aware bodies stay distinct', () => {
  const human = intelligent();
  assert.equal(formatMass(human.size), '70 kg');
  assert.equal(keyFor(human), 'toolmaker');
  assert.match(portrait(human, 30, 1), /M136,10 L132,120/);
  for (const kg of [20, 200]) {
    assert.equal(keyFor(intelligent({ size: sizeForKg(kg) })), 'toolmaker');
  }
  for (const patch of [
    { size: sizeForKg(5) }, { size: sizeForKg(201) },
    { habitat: 'aquatic' as const }, { habitat: 'amphibious' as const },
    { flight: .8 }, { grasp: .2 }, { fur: .1 },
  ]) {
    const g = intelligent(patch);
    assert.notEqual(describe(g).icon, '🧑');
    assert.doesNotMatch(portrait(g, 30, 1), /M136,10 L132,120/);
    assert.equal(g.intel, SENTIENCE);
  }
  assert.equal(keyFor(intelligent({ habitat:'aquatic',size:sizeForKg(1800) })), 'whale');
});
