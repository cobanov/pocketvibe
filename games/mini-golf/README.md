# Mini Golf

A physics minigolf course for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Play two courses of nine hand-made holes. The Meadow runs from a straight first putt to a winding par 4 finale: banks, a ramp to a plateau with an open back edge, a turnstile, a pond with a narrow bridge, a sand trap and a sliding gate, a volcano with the cup on top. Hillside adds a tilted green, a zig zag between blocks, a windmill whose sails close the tunnel under it, a bowl, twin spinners, an island green, a pinball table, a cliff walk with open drops on both sides and a climb to the summit. Pick the course on the title screen; each keeps its own best total.

Turn your aim with the D-pad while a dotted line shows the path up to the first bounce, then hold A: the power meter swings up and down (it rests a moment at full), the dotted line now runs as far as the putt would roll on level ground and a gold ring marks where it would stop, and releasing A putts with whatever the meter shows. Near the cup the meter switches to the short putting range by itself, so short putts get the whole meter; X switches between the full and the short range. The ball rolls on real slopes with friction, bounces off wooden borders, gets kicked by bumpers and pushed by spinners, sliding gates and windmill sails; it drops into the cup only if it arrives slowly enough, otherwise it lips out. Water and open edges cost a stroke and put the ball back where it was (a ball a moving obstacle knocked in is dropped again for free, clear of it), and after 8 strokes the ball is picked up. A scorecard follows every hole.

Sound effects for every putt, bounce, ramp, splash and cup, a bossa nova theme, and Sound and Music switches in the pause menu and under Options on the title.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Turn the aim (faster while held) |
| D-pad UP / DOWN | Fine-tune the aim; choose in menus |
| A | Hold to charge the power meter, release to putt; select, skip the hole intro, next hole |
| B | Cancel a charged putt; back |
| X | Switch the power range: full or short putt |
| Y | Overview of the whole hole and back |
| START | Pause menu (Resume, Sound, Music, Quit to title) |

Code: `src/main.js` (states, menus, aiming, the power meter and its ranges, scoring, camera, sounds, title demo), `src/holes.js` (the two courses as ASCII maps with terrain and moving obstacles), `src/course.js` (turns a hole into tiles, wall segments, a height field and a walking-distance map), `src/physics.js` (ball physics in fixed sub-steps: friction, slopes, bounces, movers, the windmill, the cup, the aim ray and free drops), `src/world.js` (each hole as one merged mesh within a triangle budget, plus water, movers, the windmill, the flag and the bumpers), `src/ball.js` (ball, shadow, trail and putter), `src/aim.js` (aim line, putt preview and the suggested aim), `src/fx.js` (pooled particles, confetti and rings), `src/hud.js` (HUD, meter, banners and the scorecard), `src/demo.js` (the title screen's demo putts), `src/shared.js` (colors and mesh helpers), `src/sound.js` (the shared PocketVibe sound module). The effects are made by `tools/sfx/games/mini-golf.py`. `src/handheld.js` is the unchanged device layer from the template.
