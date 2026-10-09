# Pulse Dash

A rhythm auto-runner for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Your cube slides right in time with the level's track and turns a quarter turn with every jump. Spikes, blocks, tall pillars, gaps, jump pads (an automatic high jump) and jump rings (press A in the air over one to jump again) all sit on the beat grid, so the jumps fall on the music, and holding A jumps again the moment the cube lands. One touch of a spike, the side of a block or a fall into a gap ends the attempt; A starts the level again at once and the attempt counter goes up. A bar at the top shows how far you got, with a mark where your best run ended (it flares up as you pass it), and the best percent of each level is saved.

There are five hand-made levels, each with its own synthesized track and colours: Neon Steps (Easy, 120 BPM), Sunset Grid (Normal, 128 BPM, a bright major-key song with a melody, pads that bounce you from one to the next), Night Circuit (Hard, 135 BPM), Overvolt (Harder, 150 BPM) and Hyperline (Insane, 160 BPM, a pad that throws you up to a ring over a row of spikes). Later levels are faster and add double spikes, ring chains over long gaps, low spiked roofs to run under and pad launches onto towers.

Practice (on the title) is for learning a level: every couple of bars, where the cube stands on solid ground and the way on can still be made, it sets a green checkpoint, and a crash puts the cube back on the last one while the music leads in to it. Practice runs do not change the best percent.

Music and effects are synthesized in the game, with no audio files. The title plays the selected level's song under its demo; the pause menu stops the song and it picks up again a moment before where it stopped. Sound and Music can be switched off in Options on the title or in the pause menu; with the music off, the level still runs on the song's clock. Effects (rings climbing the scale along a chain, pads, checkpoints, a new best, the crash, menus) play in each level's key.

| Button | Action |
|---|---|
| A or UP | Jump (hold to keep jumping), jump again over a ring |
| D-pad left / right | Choose a level on the title screen |
| D-pad up / down, A | Choose and pick in menus (Play, Practice, Options) |
| A | Retry, next level |
| START | Pause menu / resume |
| B | Back in menus, resume; title after a crash or a finished level |

Code: `src/main.js` (states, menus, attempts, practice checkpoints, camera and loop), `src/sim.js` (the cube's physics on the level grid, timed by distance), `src/levels.js` (the five levels as one-bar chunks, with their music and colours), `src/level.js` (turns a level into lookup arrays), `src/solver.js` (finds a way through a level for the title-screen autopilot, and the fair checkpoint spots for practice), `src/music.js` (Web Audio synthesis rendered offline, playback, the audio unlock and the song clock), `src/world.js` (grid floor, obstacles, checkpoints and finish gate, one InstancedMesh per kind), `src/backdrop.js` (pulsing scenery), `src/cube.js`, `src/fx.js` (particles and shockwave), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.
