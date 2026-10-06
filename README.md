# Evolution Simulator

A god game about evolution. A procedurally generated world starts with a single kind of microbe at
the deep-sea vents; over four billion years it mutates, speciates and spreads. You are God: you shape the
air, the climate and the land, and life adapts to whatever you make.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static site in `dist/`.

## Playing

- **Difficulty**: Gentle, Normal or Hard set your starting divine energy, how fast it returns,
  the price of every miracle, how often the planet itself strikes with fire, eruptions, impacts and
  plague, and how demanding the Eden and Dominion goals are.
- **Goals**: raise a self-aware species (*The Awakening*), let one animal exterminate all others
  (*Dominion*), grow a rich biosphere (*Garden of Eden*), or just play in the *Sandbox*.
- **Air, Sun & Sea**: sliders for solar output, CO₂, oxygen, methane, sulfur haze and sea level. The
  biosphere pulls the gases back towards its own balance, so lasting change means changing life itself.
- **Divine powers**: wildfire, rain, drought, minerals, acid/alkali, mutagen, plague, the Ark (move a
  species to another continent), volcano and meteor. Pick one, then click the map.
- **Guided evolution**: select a species, open **Traits & evolution**, and press ＋/− on a trait to breed a daughter species.
  Natural selection decides whether she survives.
- **Zoom in**: scroll over the map (or `+` / `−`, or the buttons in its corner) and drag to pan. Up
  close the map shows waves, drifting algae, kelp, forests, mountains, fires, volcanoes and the
  animals themselves. `0` shows the whole world; **📍 Locate** flies to a species.
- **Inspect a place**: click the map to open the place inspector: the climate there and every
  species living in a spot, an area or a whole region around it, each with its picture. The
  **World / Region / Landscape / Close-up** buttons at the foot of the map fly there step by step.
- **Regions**: the world is divided into named regions ("Southern Thalea Steppe", "The Dusk Ocean"),
  outlined on the map. Inspecting a region shows its forest and grassland, plant-eaters, hunters,
  plants and climate, and how well the selected species would do there.
- **Where to? and the Mutation lab**: rank every region for a species, or design a mutant with
  several changes (traits, preferred warmth and rain), compare it with its parent region by region,
  choose where to release it and shelter it while it settles. Mutants you make are never culled to
  make room for others. **🎥 Follow** keeps the camera on a species.
- **Plant traits**: Height, Roots (Holdfast in the sea), Thorns & bark, Toxins, Frost hardiness and
  Seeds. Species slowly adapt towards the climate at the edge of their range, so forests spread
  from the poles to the tropics.
- **Pictures**: every species gets a portrait generated from its genes (body plan, horns, fur,
  armour, wings, warning colours, company), shown in the lists and in the **📖 Field guide**.
- **Atlas illustrations**: the close-up map uses 93 coordinated drawings, including distinct fish,
  lizard and plant variants, hills, dunes, rock outcrops, shores, coastal cliffs and ice.
  See [the artwork catalogue and review page](docs/landscape-art.md).
- **Overview and history**: time, speed, energy and purpose stay in the top bar; detailed map layers
  are under **More layers**, and guides, chapters and sound are under **Library & settings**.
  Find a species by name or description, or filter to **✦ Mine**. Chronicle has filters for all
  events, turning points and your creations; expand it to read more, or hide it for more map space.
  Reading older events preserves your position, with **Latest** showing new arrivals.
  See [the interface layout and review checks](docs/game-ui.md).
- **Stats and causes of death**: **📊 Stats** shows how a species spread (numbers, range and the
  continents it reached), what killed it (hunters, grazers, plague, fire, disasters, hunger), who ate
  it and what it ate. When a species declines or dies out, the game diagnoses why by comparing its
  living conditions now with its heyday: climate, acidity, rain, oxygen, predators, grazers, rivals
  or food.
- **Sound**: effects, an ambience that follows the map (surf, wind, fire, birdsong) and a slow
  generative score, all synthesised in the browser. 🔊 cycles music+effects / effects / off.
- **Cells**: **🔬 Cell** on any species draws how we imagine its cells are built (prokaryote, plant
  or animal cell, organelles labelled) and lists the cell types its body is made of. The help screen
  has textbook cells to compare with.
- **Narrated chapters**: five supplied recordings accompany the origin of life, landfall, flight, a mammal-like body plan and a questioning mind. Optional chapter breaks pause the simulation; replay or preview them from **Chapters**. See [playback, triggers and scientific limits](docs/chapters.md).
- **Guided tour**: offered on the start screen the first time, and from the help screen at any time.
- **Keys**: `Space` pause, `1` slow playback (the default), `2`–`3` faster playback, `+`/`−`/`0` zoom, arrow keys pan, `Esc` put the current power down.
- **Your creations**: a gold **✦** beside a species name marks a creature made in the mutation lab or through guided evolution. The mark remains in the field guide after extinction; naturally evolved descendants have their own unmarked names.

The geological clock spans four billion years. Short ecological episodes are sampled within each epoch; individual fires and infections do not last millions of years. See [the scientific model and its limits](docs/science.md).

## How the simulation works

The world is a 160×90 grid (wrapping east–west). Each cell has elevation, temperature, rainfall, pH and
minerals, derived from moving crust and the atmosphere. Radiation, UV and tectonic activity have separate map layers. Regional genetic variants respond to selection and mix through approximate gene flow.

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

Carbon moves between atmosphere, ocean, buried organic matter and rock. Net burial supplies oxygen after an initial reducing sink is depleted; oxidation consumes it. Ice changes albedo and sea level. Plate motion and carbon transfers use elapsed geological time explicitly.

Viruses have acute, genotoxic or retroviral effects. Outbreaks select standing resistance locally;
somatic damage is not inherited, and rare retroviral variation attempts are subject to selection.

Run `npm test` for model regression checks and `npm run science:survey` for three complete seeded worlds.

### Code layout

| Path | What |
| --- | --- |
| `src/sim/world.ts` | Terrain generation, climate, radiation, ice and continents |
| `src/sim/earth.ts` | Plate kinematics, orbital averaging and carbon reservoirs |
| `src/sim/genome.ts` | Genome, mutation, environmental responses, naming |
| `src/sim/species.ts` | Derived stats and species interactions |
| `src/sim/simulation.ts` | The step loop: populations, speciation, atmosphere, disasters, goals |
| `src/sim/regions.ts` | Named regions of land and sea |
| `src/sim/powers.ts` | The player's divine powers |
| `src/ui/renderer.ts` | Map painting, zoom/pan and the close-up landscape |
| `src/ui/cell.ts` | Generated cell drawings and cell-type descriptions |
| `src/ui/portrait.ts` | Generated portraits of every species |
| `src/ui/audio.ts` | Synthesised sound effects, ambience and music |
| `src/ui/tutorial.ts` | The guided tour |
| `src/ui/` (rest) | Panels, tree of life |
| `scripts/headless.ts` | Run a world without the UI (`npm run sim -- <seed> <steps>`) for balancing |
| `scripts/survey.ts` | Milestone timing across several seeds |
| `scripts/trees.ts`, `scripts/treespread.ts` | Which trees exist, and how fast they radiate across climates |
| `scripts/mutants.ts` | How long player-made mutants survive |
| `scripts/biomes.ts` | Share of each landscape type and ground plant after a full run |

Play it online: https://danielhesse79.github.io/evolution-simulator/ (deployed from `main` by
GitHub Actions).
