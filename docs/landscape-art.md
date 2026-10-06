# Living Atlas illustrations

The close-up map has 86 authored Canvas illustrations and body-plan variants. They share a
100-unit drawing space, warm dark outlines, upper-left light, muted mineral and earth colours,
and small anatomical accents. The artwork is vector geometry with transparent surroundings:
there are no image downloads, font-dependent animal glyphs, or new runtime dependencies.

`src/ui/landscape.ts` contains the palette, drawing helpers, the complete catalogue and
`landscapeSpriteKey()`. The existing icon from `describe()` remains the starting point. The
presentation resolver also reads the genome to distinguish forms sharing that icon: kelp,
sea grass, fern and shrub; palm and tree fern; fish diets; four lizard forms; seal and sea cow;
turtle and tortoise; large tyrant and swift raptor. It never changes the genome or simulation.

`getSprite()` in `src/ui/renderer.ts` caches by resolved illustration key and quantised size.
Motion and mirroring reuse those bitmaps. All icons currently returned by `describe()` and the
four terrain/event figures have custom art; the emoji fallback is only for an unknown future icon.
At close-up zoom (8× and above), microbes and algal/lichen mats use magnified miniatures instead
of dots, capped at two per patch to keep the water legible. Larger aquatic plants are illustrated
at landscape zoom as well. These are representative symbols, not a common biological scale.

Self-awareness does not determine anatomy. The upright human illustration requires an advanced,
terrestrial, furry body with grasping limbs, little flight adaptation and an estimated mass of
20–200 kg. Those are presentation bounds, not biological limits on intelligence. Larger or
differently shaped self-aware animals retain their own body-plan icon and portrait, with
"Self-aware" in the description. For example, a 1.8-tonne omnivorous furry animal retains a
bear-like form. The mass conversion, intelligence, Awakening goal and evolution rules are unchanged.

## Review and validation

With the development server running, open `/tools/sprite-atlas.html`. The contact sheet has
category filters and 16, 24 and 40-pixel samples next to every enlarged drawing. It checks every
sprite for nonempty output, transparent canvas edges and deterministic rendering. It is a
development page and is not part of the normal production entry point.

`scripts/landscape.test.ts` checks coverage against the icon vocabulary in `describe()` and
exercises the ambiguous variants through actual genomes. Existing science and chapter tests
remain part of `npm test`.

The three required pacing surveys (seeds 1, 2, 3) produced trees, land animals, advanced animals,
fur, flight and horns in all three worlds, at approximately 19.3, 16.5 and 18.0 ms per step on
the development machine. These are simulation timings, not a browser rendering benchmark.
