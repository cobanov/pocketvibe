# Star Defender

A fixed-screen shooter for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Fifty aliens in five rows march sideways across a tilted neon playfield, drop a row at every edge and speed up as their numbers thin, to the classic four-note bass march. Slide your ship along the bottom, fire up through the gaps and hide behind four bunkers that crumble block by block under bombs and stray shots. Pink stingers are worth 30, blue crabs 20 and yellow jellies 10; the mystery saucer that crosses the far end now and then is worth up to 300. Shooting a bomb cancels it. You have three ships and earn another every 2,500 points; if the aliens reach your line, the game is over.

Every cleared wave warps you to the next one, faster and starting a little closer, in a new formation (chevron, split, diamond, arrow, wings, checker). New tricks arrive along the way: divers that peel off the front of the formation and swoop at your ship (worth double while diving, and deadly if they reach you), silver armor that takes two hits, and zigzag bombs. After wave 8 the waves start over with every trick on, faster each time. The title screen and the game over panel show your best score and the furthest wave. The title menu turns sound effects and music on or off; the pause menu has the same switches.

| Button | Action |
|---|---|
| D-pad left / right | Move |
| A | Fire (hold for auto fire, tap for faster shots; two shots on screen at most) |
| START | Pause menu: resume, sound and music on or off, quit to title |
| D-pad up / down, A | Choose and select in the menus (left / right also flip Sound and Music) |
| B | Resume (paused), back to title (game over) |

Code: `src/main.js` (states, menus, scoring, sound cues and the loop), `src/waves.js` (each wave's formation, armor, divers, bombs and speed), `src/aliens.js` (the formation and its divers), `src/shots.js` (bullets, bombs and what they hit), `src/shields.js` (bunkers), `src/player.js` (the ship), `src/saucer.js`, `src/fx.js` (explosion particles), `src/background.js` (stars, planet, grid and rails), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template and `src/sound.js` the shared sound module (`tools/sfx/sound.js` in the PocketVibe repository).

Sound: the effects in `public/sfx/` are synthesised by `tools/sfx/games/star-defender.py` in the PocketVibe repository (A minor, to sit with the music); the music is `public/music/theme.ogg`.

## Start

```sh
npm install
npm run dev
```

Open the address it prints. The game shows in a 720×480 frame, the size of the handheld's screen; the links under it try the other screen shapes (4:3, 16:9 and 1:1).

## Controls in the browser

| Handheld | Keyboard |
|---|---|
| D-pad | Arrow keys |
| A | X |
| B | Z |
| X | S |
| Y | A |
| L / R | Q / W |
| Start | Enter |
| Select | Shift |

`P` toggles the performance overlay (fps, draw calls, triangles). It turns red when the game is too heavy for the handheld.

## Making your game with AI

`AGENTS.md` (also read through `CLAUDE.md`) tells AI coding tools how to write code for the handheld: the screen, the buttons and the performance rules. Describe your game to your AI tool and it will follow those rules.

## Putting it on the handheld

Coming soon.
