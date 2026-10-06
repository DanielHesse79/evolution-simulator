# Scientific model and its limits

This is an exploratory evolution game. Its mechanisms are inspired by science, but the rates,
trait scales and milestones are not fitted to Earth's history. A successful run does not predict
when multicellularity, land life or intelligence would evolve. Intelligence is a game trait;
the Awakening goal is not a scientific test of consciousness.

## Two time scales

The main clock spans **four billion years in 6,000 geological epochs** (about 667,000 years each).
Plate displacement and carbon transfers use the elapsed years explicitly. The clock continues
at the same rate after the game ends.

Playback speed is separate from this geological clock. Slow playback runs one epoch per real
second (previously four), so the nominal four-billion-year span takes 100 minutes, excluding
pauses and chapter breaks. Faster playback still targets 12 and 40 epochs per second, subject
to machine performance. This slows plate movement and all other processes together on screen;
it does not change displacement per geological year or evolution per epoch. Geology is applied
every eight epochs, so changes in coastlines remain discrete.

Population growth, dispersal, fires and infections are representative ecological episodes sampled
within these epochs. Their durations are measured in episode steps, not geological years. We do
not simulate every generation. This matters: an animated outbreak or volcano persisting on the
map must not be interpreted as one infection or eruption lasting millions of years. Ecological
and evolutionary event probabilities remain game parameters, not measured rates per year.

## Moving geography and climate

Twelve seeded crust patches move at 1–7 cm/year. The map uses an Earth-sized circumference to
convert velocity to grid displacement. Each patch retains its original relief and rock properties;
overlapping continental patches gain elevation and gaps become ocean floor. Land populations and
their regional variants are carried with moving crust, conserving biomass during this remapping.
Subsequent ecological episodes determine whether displaced populations survive.

The model favours eruptions and hydrothermal productivity at moving patch boundaries and fixed
hotspots. Coastlines, named regions, terrain rendering and habitat classifications update together.
It is a **kinematic approximation**: no mantle convection, evolving plate topology, sediment
transport or mass-conserving subduction solver. Patch overlap and polar reflection are map
approximations. Displayed boundary activity does not distinguish transform faults from volcanic
arcs. Do not treat it as a geographic reconstruction.

Land ice responds to cold conditions, cools the surface through an albedo term and removes water
from the ocean. Its sea-level contribution is added to, not substituted for, the player's sea-level
setting. Orbital oscillations with 23,000-, 41,000- and 100,000-year periods are **averaged analytically**
over each geological update. Most short orbital variation therefore cancels at this resolution;
we do not invent slow ice-age oscillations by undersampling it. There is no seasonal climate,
ocean circulation, evolving stellar luminosity or resolved individual glacial cycle.

## Carbon and oxygen

Air, ocean, buried organic matter and geological carbon are separate stocks in abstract carbon
units. Net burial represents the small fraction of photosynthesis not promptly returned by
respiration and decomposition. Burial removes atmospheric carbon; oxidation returns it.
Weathering moves carbon into rock; degassing returns it; air and ocean exchange carbon.
These transfers conserve their combined carbon stock before player interventions, eruptions and
the game's atmosphere bounds. Carbon units share the atmospheric CO₂ display scale for convenience;
they are not calibrated global gigatonne inventories. Biomass is not a fourth carbon inventory.

Oxygen accumulates with burial only after an initial reservoir of reducing material has consumed
some of it; oxidation consumes oxygen. Thus oxygen is no longer assigned a target simply from
the current number of plants. The biological production coefficients, oxygen conversion and
reservoir exchange times are illustrative. Atmospheric oxygen is still used as a coarse proxy for
aquatic oxygen availability; dissolved oxygen and ocean anoxia are not explicitly resolved.

## Variation, selection and local populations

Single mutations are blind, but the game samples only a few speciation events per lineage, not every
generation. Each proposal therefore stands for many generations of selection that are not simulated:
it leans towards the climate, food and body size of the place where the daughter is born (larger land
plants where water allows, smaller where it is dry), with random variation on top. This is a deliberate
game shortcut, not a claim that mutation is directed. Structural limits still constrain possible body
plans, and selection still tests whether a variant can establish in the local food web. Most attempts
disappear without creating a named species. A variant that does better both where it is born and in the
founder's home spreads through the whole species instead of founding a new one, so traits can accumulate.

Each species also has regional variation in thermal, pH and moisture preferences across 60 spatial
patches. Random local variants can be selected or occasionally persist through near-neutral drift.
Occupied neighbouring patches exchange some variation, and daughter lineages inherit their local
founder's preferences. In addition, the whole species slowly drifts towards the climate it lives in and,
a little, towards the climate at the edge of its range, widening its tolerance when that edge lies in a
different climate. This again stands in for unsimulated generations and lets forests spread across climates.
Regional resistance allele frequencies start with standing variation and respond to differential
survival during infection. Gene flow is approximate patch mixing, not individual mating or a full
population-genetic model; there are no explicit chromosomes, recombination or reproductive isolation.
The portrait and genome panel show a lineage's reference body plan, not every regional variant.

Once animals with backbones exist and twelve land animal species are established, the seas settle:
marine animals and microbes live on but no longer branch into new species (marine plants, which make
much of the oxygen, keep evolving). This keeps the game focused on the land; it is not a biological claim. Shared niche and total
species limits remain for performance and gameplay; they are not biological laws. Complexity tiers,
oxygen thresholds, taxonomic labels, the restriction of chemical-feeding organisms to small body
plans, and guaranteed model advantages of some body plans are still deliberate simplifications.

## Radiation

The Radiation layer is an **ionizing exposure index**, combining a seeded rock component with a
cosmic component that increases with altitude and latitude. The rock component moves with its
crust. Water attenuates exposure; deep-water organisms receive greater shielding. This is a coarse
habitat average, not a radiation-transport calculation or a dose in mSv/Gy.

UV has its own layer. It follows sunlight strength by latitude, rises with altitude, and is attenuated
by water and by an oxygen-dependent ozone proxy that saturates (an ozone layer reduces surface UV by about
three quarters but never removes it). UV and
ionizing radiation are not treated as the same physical source. Radiation introduces a small
fitness burden representing residual damage after generic cellular repair, and increases the
number of random mutation attempts. It does not direct mutations or guarantee useful traits.
Mutation pressure is sampled across a lineage's occupied range; it is not an individual dosimetry
or germ-cell exposure model. Fitness damage is applied at each cell.
Repair is currently a shared coefficient, not a separately evolving trait. Rock chemistry is seeded,
not measured geology; isotope decay, radon transport and magnetic-field evolution are omitted.

## Viruses

- **Acute:** relatively severe mortality; local standing resistance changes through selection.
- **Genotoxic:** an additional somatic damage burden. This does not rewrite the inherited genome.
- **Retroviral:** lower acute mortality, a longer sampled episode, and a rare additional inherited
  variation attempt subject to the ordinary establishment checks. A successful lineage is recorded
  in the chronicle. This represents germline insertion abstractly, not a simulated viral sequence.

Recovered cells cannot be reinfected in the same outbreak. This is temporary outbreak state;
every later outbreak starts fresh. There is no blanket permanent immunity bonus for the entire
species. Virus family probabilities, host compatibility, insertion probability and severity are
game parameters. Germline invasion in nature is much more specific than this abstraction.

## Sources behind the mechanisms

- [USGS: plate motion, boundaries and hotspots](https://pubs.usgs.gov/gip/volcus/page08.html)
- [Smithsonian: early life and animal origins](https://naturalhistory.si.edu/education/teaching-resources/life-science/early-life-earth-animal-origins)
- [EPA: background radiation sources](https://www.epa.gov/radiation/radiation-sources-and-doses)
- [NHGRI: mutation and somatic versus germline inheritance](https://www.genome.gov/genetics-glossary/Mutation)
- [UC Berkeley: mutation is not directed toward usefulness](https://evolution.berkeley.edu/dna-and-mutations/mutations-are-random/)
- [Mi et al., Nature: syncytin, a retroviral envelope protein expressed in placenta](https://www.nature.com/articles/35001608)
- [Nature Communications: koala retrovirus germline invasion](https://www.nature.com/articles/s41467-021-21612-7)
- [NASA: the carbon cycle](https://science.nasa.gov/earth/earth-observatory/the-carbon-cycle/)
- [NASA: orbital cycles and climate](https://science.nasa.gov/science-research/earth-science/climate-science/milankovitch-orbital-cycles-and-their-role-in-earths-climate/)

These sources support the mechanisms, not the game's numerical coefficients.

## Validation

`npm test` checks that mutation proposals lean towards the local climate while staying variable, time continuity, orbital averaging, plate units
and repeatability, carbon conservation, separate UV shielding, biomass conservation during crust
movement, refreshed regions, and local rather than global resistance after infection.

`npm run science:survey` runs three seeded worlds for all 6,000 epochs, checks finite non-negative
populations and atmosphere, verifies that marine plants keep branching in later epochs, that settled seas
bring forth no new animals or microbes, and that forests arise. This is
a stability check, not a validation of biological realism or equal difficulty for every goal.

Verification on 2026-10-05: all nine regression tests and the production build passed. The complete
survey finished with 136, 130 and 125 living species for seeds 12345, 42 and 2026 respectively;
their second halves produced 621, 656 and 576 aquatic branches. All three reached land plants and
land animals, without a guaranteed intelligence milestone. Browser checks covered the geological
clock, the three new layers and console errors.
