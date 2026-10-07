# Notes for AI coding agents (Codex, Claude and others)

This is a browser game about evolution (TypeScript + Vite). `main` deploys straight to GitHub
Pages, so whatever is pushed is live for players.

## Design decisions the owner has asked for — do not remove them

These are gameplay choices. Some are deliberate scientific shortcuts; keep them even when a more
"realistic" model looks tempting, and talk to the owner before changing them.

1. **Mutation proposals lean towards the place where the daughter is born** (`mutate` in
   `src/sim/genome.ts`). The game samples only a few speciation events per lineage, so each proposal
   stands for many generations of selection. Without this lean, trees, horns and intelligence never
   evolve on their own. Directed plant size (taller where water allows, smaller where it is dry) is
   what makes forests possible.
2. **An improvement that works at home and abroad spreads through the whole species** (the sweep in
   `trySpeciate`), so traits accumulate.
3. **Species drift towards the climate of their range and its frontier** (`driftWithRange`), so
   forests spread from the poles to the tropics.
4. **The seas settle** once animals with backbones exist and 12 land animal species are established:
   marine animals and microbes stop branching; marine plants keep evolving (`seaSettled`).
5. **Gentle housekeeping**: young, growing, sheltered, player-made or self-aware species are never
   culled to make room (`cullable`). Room for 250 species.
6. **Player-made mutants** (lab and guided evolution) are sheltered while they settle and never culled.
7. **Rivers and lakes matter**: rain drains downhill into rivers and fills basins into lakes
   (`drainage`/`hydrology` in `src/sim/world.ts`). In dry country land animals must stay within reach
   of fresh water (`thirstFit` in `src/sim/species.ts`), so they gather along rivers and round lakes.
8. **Continents drift slowly**: plates move at 30 % of real speed (`DRIFT` in `src/sim/earth.ts`).
9. **A food web that can balance**: animals that live differently (body plan, flight, climbing) compete
   less (`pairAlpha`), insects eat tree leaves, and flying animals with backbones eat seeds, fruit and
   insects rather than foliage, so forests feed insects and insects feed birds.

## Before committing a change to the simulation

`npm test` only checks mechanisms. Also check that the game still plays:

```bash
npx tsx scripts/survey.ts 1 2 3
```

Trees, land animals, animals with backbones, fur, flight and horns should appear in most worlds,
and a step should stay around 15–25 ms. Further checks: `scripts/treespread.ts` (forests reach warm
lands within ~1,000 steps of the first tree), `scripts/mutants.ts` (player-made mutants survive),
`scripts/biomes.ts` (forest, grassland and little bare rock), `scripts/autoplay.ts` (the Awakening
goal can be won), `scripts/foodweb.ts` (insects under trees, what birds eat, why land animals die
out), `npm run science:survey`. Run them one at a time: each one keeps a CPU core busy.

## Other conventions

- Commit messages explain why. Do not push unfinished work: it goes live immediately.
- The game is public. Do not cast the player as God (no "divine", "miracles" or similar), and keep
  the notice that it is a game for fun, not for teaching or reference, on the start screen, the help
  screen and in the README.
- The UI text is English; the owner writes in Swedish.
- Map figures in the close-up view should share one illustration style (`src/ui/landscape.ts`).
