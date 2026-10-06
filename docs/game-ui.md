# Game interface

The layout gives the player a stable overview while revealing detailed controls when needed.
Time, playback, energy and the current purpose stay together above the map. Divine powers sit
on the left, living species and the selected creature on the right. World overview is open by
default; atmosphere sliders, detailed map layers, library tools and genome controls open on demand.

Chronicle has its own reserved height instead of taking the space left after fitting the map.
Expand and Hide resize the map through its normal fitting logic. Event text wraps, linked events
are keyboard-accessible buttons, and the three filters select all events, major turning points or
events attached to player-created species. Each filter shows its latest 300 matching events.
The count includes all matching events, even when older entries fall outside this display window.
Reading older history keeps the same visible event and offset as new entries arrive. The Latest
button reports matching arrivals and returns to the top; events follow automatically while at the top.

Species search matches the name and body-plan description and combines with the category and
Mine filters. Traits & evolution exposes the existing mutation controls without crowding basic
facts and actions. Search, buttons, disclosures and Chronicle scrolling keep their native keyboard
behaviour rather than also triggering map shortcuts.

`src/ui/game-layout.css` owns the structural overrides. Desktop keeps three columns; below
900 pixels the map and history precede the side panels, and below 540 pixels those panels stack.
No simulation rules, time rates, chapter preferences or species origins are changed by this layout.

## Review checks

- Check the whole-world map, detailed map layers and landscape zoom.
- Generate linked events through guided evolution, read older entries, generate another event,
  and verify the reading position and Latest count.
- Check each history filter, Expand, Hide and Show, including the map resizing.
- Combine species search, category and Mine filters; select rows and open Traits with the keyboard.
- Open library tools and ensure menus close after choosing an action and on Escape.
- Check desktop, tablet and narrow mobile widths for clipped controls and horizontal page overflow.
- Run `npm test`, `npm run build` and the sprite atlas pixel checks.

The 2026-10-06 review passed at 1280×720, 1024×768, 768×1024 and 390×844. Browser checks
covered search and creation filters, linked-event selection, history resizing, map layers, library
menus, keyboard activation and the guided tour revealing atmosphere sliders. An older event
kept its screen position within one pixel after another guided mutant arrived, with Latest
reporting one new entry. A focused species action also remained focused across live simulation
updates. The art catalogue validated all 93 drawings for painted output, transparent edges and
repeatability; the map was checked at landscape and close-up zoom. All 20 existing tests and
the production build passed. No simulation files changed, so the simulation pacing survey was
not rerun for this interface change.
