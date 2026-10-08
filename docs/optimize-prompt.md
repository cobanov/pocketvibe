# Polish and speed up the games

You are taking over the PocketVibe games in `games/` (20 games, one folder each) to debug them and make every one of them run smoothly on the handheld. Read this whole file first, then `bench/results/2026-10-08-limits.md` (the measured limits of the device) and `template/AGENTS.md` (the rules games follow).

## The goal

Every game holds 60 fps on the Anbernic RG34XX SP during real play, not only on its title screen: an average of at least 55 fps, and no frame longer than 50 ms after loading. Fix the bugs you find on the way. Keep each game's look and feel; prefer fixes the player cannot see (culling, fog distance, instancing, non-indexed merged geometry, warming up shaders) over cutting detail, and cut detail before lowering the resolution.

## What changed

The old rule said 60,000 triangles. It was wrong: the earlier benchmark's triangles were mostly off screen. Measured properly, the device draws about **10,000 triangles inside the view** per frame at 60 fps (15k: 48 fps, 20k: 39 fps). Off-screen triangles are almost free. The other findings that matter most for the games:

- A large **indexed** mesh costs about 0.6 µs of CPU per triangle every frame in WebKit. Merged level geometry must be made with `.toNonIndexed()`.
- Draw calls cost 30 to 70 µs each: 100 per frame at most.
- `MeshStandardMaterial` drops a simple scene to 37 fps, each point light costs about 3 ms, any shadow map drops to 36 fps or lower, bloom costs 20 fps.
- The first draw of a new material compiles a shader (90 to 300 ms), and textures and geometries upload on first use (100 ms for a 1024×1024 PNG). Everything must be compiled and uploaded while the game loads.
- Updating many HTML elements per frame, `backdrop-filter`, and redrawing a canvas texture every frame are all expensive.
- `createHandheld({ resolution: 0.5 })` draws the 3D scene at 360×240; a 20,000-triangle scene went from 27 to 60 fps.

Earlier device runs of the older games: Turbo Circuit 48 fps (26.8k triangles at the start line), Star Defender 48 fps, Sky Hopper 56 fps, the rest 60 fps on their opening screens. The nine newest games (maze-chase, tank-brigade, tower-stack, pulse-dash, cloud-climber, snow-slalom, mini-golf, tile-merge, crate-pusher) have not run on the device yet.

## For every game

1. Copy `template/AGENTS.md` and `template/src/handheld.js` over the game's own copies. The new `handheld.js` has the measured budget in its overlay, the `resolution` option and `?perflog`. Check the game still works; it must not have changed its copy of `handheld.js`, but look before overwriting.
2. Find the expensive parts in the code: count triangles inside the view in the busiest moment of play, draw calls, materials, lights, shadows, transparent layers, particles, per-frame DOM or canvas work, and anything created or first shown during play.
3. Measure in the browser (`npm run dev`, press `P`): the overlay shows draw calls and triangles; it turns red over budget. The desktop's frame rate says nothing about the handheld's.
4. Measure on the handheld (below), in real play, not only on the title screen.
5. Fix, measure again, and repeat until the goal is met.
6. Raise `version` in `pocketvibe.json` (1.0.1 to 1.0.2 and so on) and note what changed and the before and after numbers in your report.

## The handheld

- It is reachable from this Mac over Tailscale at `root@100.86.26.111` (at home also `root@192.168.8.197`). Scripts take the address from `HANDHELD`, e.g. `HANDHELD=root@100.86.26.111 sh device/play.sh games/<folder>/dist`.
- Build first (`npm run build` in the game's folder), then `device/play.sh <dist>` puts it in the PocketVibe Library and starts it.
- To read the frame rate without looking at the screen: `ssh root@100.86.26.111 'sh /storage/pocketvibe/run-game.sh <id> "&perflog"'`, play, then `grep PERF /tmp/pocketvibe-cog.log` on the handheld. Each PERF line covers two seconds: `fps`, `worstMs` (the longest frame), `calls`, `triangles`.
- To play it without touching the device, `tools/handheld-pad.py` adds a virtual gamepad and `tools/handheld-run.sh` plays a file of button presses and takes screenshots (see `docs/development.md`). The first press on a new page must be held for 200 to 300 ms. **Only drive the handheld when the user says they are not using it**; virtual presses mix with theirs.
- WebKit does not give back GPU memory when the page changes. After testing many games in a row, restart the browser (`ssh root@100.86.26.111 'pkill -KILL -x cog'`; the app starts it again on the launcher) so low memory does not distort the numbers.
- `pkill -f <pattern>` over SSH also kills your own SSH session when the pattern matches the command line; kill by PID or write the pattern as `serve[r]`.

## Rules

- Work only inside `games/` and on `docs/upcoming-games.md`. Do not change `template/`, `app/`, `store/`, `site/` or `bench/`; if the template or the rules need a change, say so in your report.
- The user reviews before anything is committed or published. When they approve, commit the games, then publish each changed game from the repository's root with `node packages/pocketvibe/cli.js publish games/<folder>` and update the website with `cd site && npm run deploy`.
- Talk to the user in Turkish. Never use the em dash or the en dash anywhere.
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
