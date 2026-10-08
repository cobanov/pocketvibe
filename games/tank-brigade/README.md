# Tank Brigade

A top-down tank battle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Defend the energy core at the bottom of a 13×13 tile field, seen from a tilted camera, against twenty enemy tanks per stage. They come in from three points at the top, at most four at a time, wander the field, fire now and then and drift towards the core and towards you. Brick walls break a quarter at a time, steel only gives way to a fully upgraded gun, water stops tanks but not shells, trees hide whatever drives under them, and ice makes your tank slide. Basic tanks are worth 100 points, fast ones 200, power tanks (fast shells) 300 and armoured tanks 400; armoured tanks take four hits and change colour as they crack. The 4th, 11th and 18th enemy flash red and drop a power-up when hit: a star upgrades your gun (faster shells, then two at once, then steel-breaking), a helmet gives a shield, a clock freezes the enemies, a bomb wipes out every enemy on the field, a shovel puts steel around the core for a while and a tank is an extra life. Each pickup is worth 500. A tally after every stage counts your kills, with a 1000 bonus for a stage without losing a tank. There are ten hand-made stages; after the last one they loop with tougher tanks that come in faster. You have three tanks, and the game ends at once if a shell hits the core. The best score and the furthest stage are saved, and the title lets you start from any stage you have reached.

| Button | Action |
|---|---|
| D-pad | Drive (the tank lines up with the half-tile grid when it turns); on the title, ◀ ▶ choose the start stage |
| A | Fire (hold for auto fire); start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, waves, scoring, power-ups, tally and camera), `src/field.js` (the cell grid, bricks and steel as InstancedMeshes, water, trees, ice and the core), `src/tanks.js` (movement on the grid, collisions, enemy AI and drawing with animated tracks), `src/bullets.js` (shells and their hits), `src/powerups.js`, `src/stages.js` (the ten stage maps and enemy mixes), `src/models.js` (low-poly models merged into single geometries), `src/world.js` (the camp around the field, one merged mesh), `src/fx.js` (pooled fireballs, smoke, debris, rings and scorch marks), `src/hud.js`, `src/shared.js` (grid constants and mesh helpers). `src/handheld.js` is the unchanged device layer from the template.
