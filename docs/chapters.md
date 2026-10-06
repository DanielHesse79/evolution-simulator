# Narrated chapters

The five original files in `Media/` are imported as build assets. No external speech service,
API key, upload or runtime synthesis is needed. File names select the chapters, since several of
the recordings reuse the same embedded album/title. Durations were verified with ffprobe;
transcripts follow the embedded `lyrics-eng` tags, including the revised philosophical ending.

| Chapter | Recording length | Automatic trigger |
| --- | --- | --- |
| The first spark | 48.552 s | Starting a new world with chapter breaks enabled |
| Beyond the shore | 38.448 s | An established animal occupies at least three land cells, with at least 60% of its biomass on land |
| Taking flight | 38.712 s | The land-population criteria plus flight > 0.5 |
| Warmth in the darkness | 30.528 s | The land-population criteria plus tier 4, fur > 0.5 and sociality > 0.25 |
| A questioning mind | 42.072 s | The land-population criteria plus tier 4, fur > 0.4, grasping > 0.5, sociality > 0.5, intelligence > 0.7, flight < 0.35 and size < 8.3 |

The same qualifying lineage must remain eligible across observations for 32 simulation steps.
Each milestone is recorded once per world. Chapters can appear in different orders and need not
all appear. The presentation observer does not consume the simulation's random numbers or alter
genomes, reproduction or survival.

## Scientific scope

The last two chapters use **body-plan proxies**, not a taxonomic classifier. The mammal-like
recording mentions milk; lactation and internal heat production are not independently modelled.
That scene is explicitly labelled as a reconstruction. The questioning-mind scene follows a
dexterous, social, intelligent ape-like body plan rather than asserting proven self-awareness.
These proxies should be replaced by explicit biological traits if the underlying genome is expanded.

## Playback and accessibility

- A native modal dialog keeps keyboard focus inside the sequence and prevents background actions.
- Simulation stepping stops while the player or chapter library is open. The previous pause
  setting, speed, selection, map layer and camera are retained.
- The chapter uses its own map renderer and the triggering lineage's saved genome portrait.
  Replay shows the recorded lineage against the present-day landscape, labelled accordingly.
- The intro precedes the optional guided tour. Later automatic chapters wait until ordinary
  dialogs and the tour are closed. Simultaneous milestones are queued.
- The supplied soundtrack replaces the usual gameplay audio during the sequence. The recording
  initially respects the game's silent mode; the player can explicitly enable narration in the
  chapter. Narration and subtitle preferences are saved locally.
- Playback duration and the camera move follow the actual audio clock. Pause stops its progress.
  Full-script subtitles are shown together: no fabricated word-level timings or forced alignment.
- Escape/Skip stops and releases the recording immediately. Audio errors and autoplay restrictions
  leave the transcript and an exit available. Reduced-motion preference stops camera travel and
  decorative animation.
- Chapters can be replayed or previewed from the toolbar. Unreached chapters use clearly labelled
  illustrative species; previews never change milestone records. Automatic breaks can be disabled
  on the start screen or in the chapter library. Unlocked chapters remain replayable when disabled.

The original MP3 files are left unchanged. Vite copies them to hashed asset names so production
works from a subdirectory such as GitHub Pages.
