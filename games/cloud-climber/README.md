# Cloud Climber

A vertical cloud-bouncing platformer for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

A little climber in aviator goggles bounces by itself every time it lands on a cloud from above; you only steer it left and right, with some momentum, and leaving one side of the column brings it back in on the other. The camera only goes up, so dropping below the bottom of the screen ends the run. White clouds are safe, blue winged clouds drift from side to side, grey storm clouds break underfoot without a bounce, lemon clouds vanish after one bounce, red springs launch you high with a flip, and the rare propeller cap flies you straight up for a few seconds. Your score is the highest point reached, in metres; stars along the way are counted too. Every cloud on the main path is always within a safe jump, but the higher you go the wider the gaps, the more moving, breaking and vanishing clouds there are, and from 250 m flying pests appear that end the run on contact unless you land on them from above. The sky turns from pastel day to sunset and then a starry night as you climb.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Steer |
| A | Start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, loop, landing, scoring and camera), `src/level.js` (the generator that keeps every jump reachable and ramps up hazards with height), `src/platforms.js` (the cloud pool, springs and their instanced drawing), `src/player.js` (steering, wrapping, bounces, propeller flight), `src/pilot.js` (the title-screen autopilot), `src/enemies.js` (flying pests), `src/pickups.js` (stars and the propeller cap), `src/sky.js` (sky colors through the day, sun and moon, meadow, parallax clouds, balloons and birds), `src/fx.js` (particles), `src/models.js` (low-poly models merged into single geometries), `src/hud.js`, `src/shared.js` (constants and helpers). `src/handheld.js` is the unchanged device layer from the template.
