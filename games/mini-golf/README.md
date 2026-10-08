# Mini Golf

A physics minigolf course for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Play nine hand-made holes, from a straight first putt to a winding par 4 finale. Turn your aim with the D-pad while a dotted line shows the path up to the first bounce, then hold A: the power meter swings up and down, and releasing A putts with whatever it shows, so timing is everything. The ball rolls on real slopes with friction, bounces off wooden borders, gets kicked by bumpers and pushed by spinners and sliding gates; it drops into the cup only if it arrives slowly enough, otherwise it lips out. Water and open edges cost a stroke and put the ball back where it was, and after 8 strokes the ball is picked up. The holes get trickier as you go: banks, a ramp to a plateau with an open back edge, a turnstile, a pond with a narrow bridge, a sand trap and a sliding gate, a volcano with the cup on top. A scorecard follows every hole; your best total is saved.

| Button | Action |
|---|---|
| D-pad LEFT / RIGHT | Turn the aim (faster while held) |
| D-pad UP / DOWN | Fine-tune the aim |
| A | Hold to charge the power meter, release to putt; start, skip the hole intro, next hole |
| B | Cancel a charged putt; back to title (paused or final card) |
| Y | Overview of the whole hole and back |
| START | Pause / resume |

Code: `src/main.js` (states, aiming and the power meter, scoring, camera, title demo), `src/holes.js` (the nine holes as ASCII maps with terrain and moving obstacles), `src/course.js` (turns a hole into tiles, wall segments, a height field and a walking-distance map), `src/physics.js` (ball physics in fixed sub-steps: friction, slopes, bounces, movers, the cup, and the aim ray), `src/world.js` (each hole as one merged mesh plus water, movers, the flag and the bumpers), `src/ball.js` (ball, shadow, trail and putter), `src/aim.js` (aim line and the suggested aim), `src/fx.js` (pooled particles, confetti and rings), `src/hud.js` (HUD, banners and the scorecard), `src/demo.js` (the title screen's demo putts), `src/shared.js` (colors and mesh helpers). `src/handheld.js` is the unchanged device layer from the template.
