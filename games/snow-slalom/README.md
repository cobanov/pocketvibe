# Snow Slalom

An endless downhill slalom for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Ski down an endless mountain seen from behind and pass between the flags of every red and blue gate. The D-pad carves: the skis go on edge and turn, so sideways speed builds through the turn instead of strafing, and letting go drifts the skis back down the fall line. DOWN tucks for more speed but turns slower; UP brakes into a snowplough. A clean pass scores 20 points times the combo, which grows by one for every clean gate in a row (up to ×10); kickers launch you into the air for an airtime bonus, and the distance in metres is added on top. A missed gate costs one of three strikes, and so does hitting a pine, a rock or a fence, which sends you tumbling and takes most of your speed. The further down you get, the faster the slope, the narrower and wider-spread the gates, and the more pines, rocks, fences and mogul fields stand in the way.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Carve left / right |
| D-pad DOWN | Tuck (faster, turns slower) |
| D-pad UP | Snowplough brake |
| A | Start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, gates, crashes, scoring, the title demo pilot and the camera), `src/skier.js` (carving physics, tuck, snowplough, airtime, crashes and the animated skier), `src/course.js` (gate and obstacle generation, recycling, collisions, moguls and kickers, one InstancedMesh per kind), `src/world.js` (recycled terrain chunks, forested banks, piste markers and the mountain backdrop), `src/models.js` (low-poly models merged into single geometries), `src/fx.js` (pooled snow particles and ski tracks), `src/hud.js`, `src/shared.js` (slope constants and mesh helpers). `src/handheld.js` is the unchanged device layer from the template.
