# Snow Slalom

A downhill slalom, endless or against the clock, for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Ski down the mountain seen from behind and pass between the flags of every red and blue gate. The D-pad carves: the skis go on edge and turn, so sideways speed builds through the turn instead of strafing, and letting go drifts the skis back down the fall line. DOWN tucks for more speed but turns slower; UP brakes into a snowplough. A gate counts as long as any part of the skier passes between its poles, so one taken right on the edge (knocking the pole) is clean.

Two modes, chosen on the title:

- **Endless**: a clean pass scores 20 points times the combo, which grows by one for every clean gate in a row (up to ×10). Kickers launch you into the air for an airtime bonus; press A in the air for a 360 (a second press makes it a 720), but land in the middle of a spin and you wipe out. Gold bonus flags off the racing line are worth 100 points if the next gate still fits. The distance in metres is added on top. A missed gate costs one of three strikes, and so does hitting a pine, a rock or a fence, or a wipeout. The further down you get, the steeper and faster the slope, the narrower and wider-spread the gates, and the more pines, rocks, fences, mogul fields and sheets of ice stand in the way.
- **Time Trial**: the same 36-gate course every time, from a standing start (3, 2, 1, GO) to a checkered finish. A missed gate adds three seconds; crashes cost only the time it takes to get up. Gates 12 and 24 show your split against the best run.

On ice the edges hardly bite: the skis keep going where they point, so set the line before you reach it. The best score and the best trial time are kept and shown on the title. The pause menu (START) and the title's Options turn sound effects and music on or off.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Carve left / right |
| D-pad DOWN | Tuck (faster, turns slower) |
| D-pad UP | Snowplough brake |
| D-pad | Choose in menus |
| A | Select; spin in the air off a kicker (endless) |
| B | Back; resume from the pause menu |
| START | Pause menu |

Code: `src/main.js` (modes, menus, states, gates, crashes, scoring, tricks, the trial clock and splits, sounds, the title demo pilot and the camera), `src/skier.js` (carving physics, tuck, snowplough, ice, airtime, spins, crashes and the animated skier), `src/course.js` (gate and obstacle generation, seeded for the trial, recycling, swept collisions, moguls, kickers, ice, bonus flags and the finish line, one InstancedMesh per kind), `src/world.js` (recycled terrain chunks, forested banks, piste markers and the mountain backdrop), `src/models.js` (low-poly models merged into single geometries), `src/fx.js` (pooled snow particles and ski tracks), `src/hud.js`, `src/shared.js` (slope constants, the view culling and mesh helpers), `src/sound.js` (the shared PocketVibe sound module). Sound effects are synthesised by `tools/sfx/games/snow-slalom.py` in the PocketVibe repository. Pines, markers and course objects are drawn only when the camera can see them (in view and nearer than the end of the fog), which keeps the busiest moments under 10,000 triangles on every screen shape. `src/handheld.js` is the unchanged device layer from the template.
