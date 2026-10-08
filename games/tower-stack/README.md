# Tower Stack

A stacking arcade game for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

A slab slides back and forth over the top of the tower, along one axis and then the other, and A drops it. Whatever hangs over the edge is sliced off and tumbles away, so the next slab is only as big as what is left; drop it within a hair of the layer below and it snaps perfectly into place with a ring of light. Perfect drops in a row build a combo, and from the third one on each perfect drop grows the slab back a little towards its starting size. Your score is the number of layers. Miss the tower completely and the run is over: the camera pulls back to show the whole tower. The slab slides a little faster with every layer, from the eighth layer it sometimes comes in from the other side, and the sky turns from day to dusk to a starry night as you climb.

| Button | Action |
|---|---|
| A / UP | Drop the slab; start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, scoring, camera and the title demo), `src/stack.js` (the sliding slab and the drop: slicing, perfect snaps, growing back), `src/tower.js` (the placed layers, one InstancedMesh), `src/debris.js` (falling offcuts), `src/fx.js` (rings and sparkles), `src/sky.js` (sky gradient, stars, sun and moon), `src/clouds.js` (cloud bank and drifting clouds), `src/hud.js`, `src/shared.js` (constants, colours and the slab geometry). `src/handheld.js` is the unchanged device layer from the template.
