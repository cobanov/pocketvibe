# Pulse Dash

A rhythm auto-runner for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Your cube slides right in time with the level's track and turns a quarter turn with every jump. Spikes, blocks, tall pillars, gaps, jump pads (an automatic high jump) and jump rings (press A in the air over one to jump again) all sit on the beat grid, so the jumps fall on the music, and holding A jumps again the moment the cube lands. One touch of a spike, the side of a block or a fall into a gap ends the attempt; A starts the level again at once and the attempt counter goes up. A bar at the top shows how far you got, and the best percent of each level is saved. There are three hand-made levels, each with its own synthesized track and colours: Neon Steps (easy, 120 BPM), Night Circuit (medium, 135 BPM) and Overvolt (hard, 150 BPM); later levels are faster and add double spikes, ring chains over long gaps, low spiked roofs to run under and pad launches onto towers.

| Button | Action |
|---|---|
| A or UP | Jump (hold to keep jumping), jump again over a ring |
| D-pad left / right | Choose a level on the title screen |
| A | Start, retry, next level |
| START | Pause / resume |
| B | Back to title (paused, after a crash or a finished level) |

Code: `src/main.js` (states, attempts, camera and loop), `src/sim.js` (the cube's physics on the level grid, timed by distance), `src/levels.js` (the three levels as one-bar chunks, with their music and colours), `src/level.js` (turns a level into lookup arrays), `src/solver.js` (finds a way through a level for the title-screen autopilot), `src/music.js` (Web Audio synthesis rendered offline, playback and the audio clock), `src/world.js` (grid floor, obstacles and finish gate, one InstancedMesh per kind), `src/backdrop.js` (pulsing scenery), `src/cube.js`, `src/fx.js` (particles and shockwave), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.
