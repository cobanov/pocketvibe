# Cloud Climber

A vertical cloud-bouncing platformer for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

A little climber in aviator goggles bounces by itself every time it lands on a cloud from above; you only steer it left and right, with some momentum, and leaving one side of the column brings it back in on the other. The camera only goes up, so dropping below the bottom of the screen ends the run. White clouds are safe, blue winged clouds drift from side to side, grey storm clouds break underfoot without a bounce, lemon clouds vanish after one bounce, red springs launch you high with a flip, and the rare propeller cap flies you straight up for a few seconds; from 300 m a rocket jetpack sometimes waits instead, faster and further. Your score is the highest point reached, in metres; stars along the way are counted too, and bunting hangs across the sky at your best height. Every cloud on the main path is always within a safe jump, but the higher you go the wider the gaps, the more moving, breaking and vanishing clouds there are; from 250 m flying pests appear that end the run on contact unless you land on them from above, and from 400 m grumpy thunderclouds flicker, crackle and then drop a bolt of lightning. Neither is ever placed where a straight bounce off a path cloud would meet it, so on any cloud that stays you can bounce in place and pick your moment. The sky turns from pastel day to sunset, a starry night and, past 1000 m, the edge of space with a ringed planet.

Sound effects for every bounce (rising in pitch while you keep climbing), spring, pickup, pest, storm and record, a wind that picks up with height, and a looping glockenspiel theme. The title has Play and Options (Sound and Music on or off); START pauses with Resume, Sound, Music and Quit to title.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Steer |
| D-pad UP / DOWN | Choose in menus |
| A | Select / play again |
| START | Pause / resume |
| B | Back, resume from pause, title after a run |

Code: `src/main.js` (states, menus, loop, landing, scoring, sounds and camera), `src/level.js` (the generator that keeps every jump reachable, keeps hazards off straight bounces and ramps them up with height), `src/platforms.js` (the cloud pool, springs and their instanced drawing), `src/player.js` (steering, wrapping, bounces, propeller and rocket flights), `src/pilot.js` (the title-screen autopilot), `src/enemies.js` (flying pests), `src/storms.js` (thunderclouds and their lightning), `src/pickups.js` (stars, the propeller cap and the rocket), `src/marker.js` (the bunting at the best height), `src/sky.js` (sky colors from day to space, sun, moon and planet, meadow, parallax clouds, balloons and birds), `src/fx.js` (particles), `src/models.js` (low-poly models merged into single geometries), `src/hud.js`, `src/shared.js` (constants and helpers, among them the trimming that drops the faces the camera never sees). `src/sound.js` is the shared PocketVibe sound module, unchanged; the effects in `public/sfx/` are made by `tools/sfx/games/cloud-climber.py` in the PocketVibe repository and the music in `public/music/` by its ACE-Step tools. `src/handheld.js` is the unchanged device layer from the template.
