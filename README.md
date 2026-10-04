# Evolution Simulator

A god game about evolution. A procedurally generated world starts with a single kind of microbe at
the deep-sea vents; over a million years it mutates, speciates and spreads. You are God: you shape the
air, the climate and the land, and life adapts to whatever you make.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static site in `dist/`.

## Playing

- **Goals**: raise a self-aware species (*The Awakening*), let one animal exterminate all others
  (*Dominion*), grow a rich biosphere (*Garden of Eden*), or just play in the *Sandbox*.
- **Air, Sun & Sea**: sliders for solar output, CO₂, oxygen, methane, sulfur haze and sea level. The
  biosphere pulls the gases back towards its own balance, so lasting change means changing life itself.
- **Divine powers**: wildfire, rain, drought, minerals, acid/alkali, mutagen, plague, the Ark (move a
  species to another continent), volcano and meteor. Pick one, then click the map.
- **Guided evolution**: select a species and press ＋/− on a trait to breed a daughter species.
  Natural selection decides whether she survives.
- **Zoom in**: scroll over the map (or `+` / `−`, or the buttons in its corner) and drag to pan. Up
  close the map shows waves, drifting algae, kelp, forests, mountains, fires, volcanoes and the
  animals themselves. `0` shows the whole world; **📍 Locate** flies to a species.
- **Cells**: **🔬 Cell** on any species draws how we imagine its cells are built (prokaryote, plant
  or animal cell, organelles labelled) and lists the cell types its body is made of. The help screen
  has textbook cells to compare with.
- **Guided tour**: offered on the start screen the first time, and from the help screen at any time.
- **Keys**: `Space` pause, `1`–`3` speed, `+`/`−`/`0` zoom, arrow keys pan, `Esc` put the current power down.

Time runs fastest in the age of microbes and slows as life becomes complex.

## How the simulation works

The world is a 160×90 grid (wrapping east–west). Each cell has elevation, temperature, rainfall, pH and
minerals, derived from the terrain and the state of the atmosphere.

Every species has a genome: complexity tier, diet, habitat, body size, climate preferences and traits
such as horns, armor, speed, grasping limbs, insulation, flight, sociality, intelligence, immunity,
toxins and fertility. Populations live per cell and each step they

1. grow towards a carrying capacity set by light, minerals and water (plants) or by the food actually
   present (grazers and hunters),
2. compete with similar species, are grazed and are hunted,
3. spill into neighbouring cells they can live in.

New species arise by mutation. A mutant is only born if it could grow from rarity in the living
community of its birthplace (invasion fitness), so adaptation is real natural selection rather than a
script: plants grow tall where rain allows and shade out rivals, prey evolves the defence that works in
its landscape, and horns that help on the open savanna become a liability under a forest canopy.

Oxygen gates complexity: photosynthesis fills the air, complex cells, bodies, land life and large
animals each need more of it, and land plants produce the most. Photosynthesis also draws down CO₂ and
cools the planet, so a blooming biosphere can tip the world into an ice age.

### Code layout

| Path | What |
| --- | --- |
| `src/sim/world.ts` | Terrain generation, climate, continents |
| `src/sim/genome.ts` | Genome, mutation, environmental responses, naming |
| `src/sim/species.ts` | Derived stats and species interactions |
| `src/sim/simulation.ts` | The step loop: populations, speciation, atmosphere, disasters, goals |
| `src/sim/powers.ts` | The player's divine powers |
| `src/ui/renderer.ts` | Map painting, zoom/pan and the close-up landscape |
| `src/ui/cell.ts` | Generated cell drawings and cell-type descriptions |
| `src/ui/tutorial.ts` | The guided tour |
| `src/ui/` (rest) | Panels, tree of life |
| `scripts/headless.ts` | Run a world without the UI (`npm run sim -- <seed> <steps>`) for balancing |
| `scripts/survey.ts` | Milestone timing across several seeds |
