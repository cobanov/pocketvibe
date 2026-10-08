# Pole Star

A one-button rhythm comedy for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Welcome to the Pole Star Lounge, where Sergio (sequined purple unitard, sweatband, magnificent moustache) performs a very serious pole fitness show to a disco loop. A tips him a dollar: the bill flutters onto the stage and stays there. Tips on the beat (a ring closes in on the A button on every beat) go ka-ching, build a combo and raise the hype; a beat skipped or a tip off the beat ends the combo. The hype decides his move, from a bored lean on the pole (checking his watch, yawning, twirling his moustache) through the Stroll, the Fireman Spin, the Flag and the Helicopter to the Tornado, where every bill on the stage takes off and swirls round the pole. The band grows with him: string stabs join at the Fireman Spin, the lead at the Helicopter. Let the hype drop and he gets bored again, to a sad trombone. Mash the button and the bills start hitting him in the face. The show lasts one song (72 seconds); the applause is the score and earns up to five stars. Your phone keeps buzzing as your tab grows.

| Button | Action |
|---|---|
| A | Tip $1 (on the beat for combos); start / play again |
| B | Clap along (a little hype on the beat); back to title (paused or results) |
| START | Pause / resume |

Code: `src/main.js` (states, hype, combo and scoring, the MC, phone texts, camera, title demo), `src/dancer.js` (Sergio's model and skeleton, every move as a function of the beat, blending between moves, IK that keeps his hands on the pole), `src/money.js` (the bills: flight, the pile on the stage and the tornado, one InstancedMesh), `src/club.js` (stage, pole, curtains, neon sign, disco ball and its spots, light beams, bulbs, speakers and the front row), `src/audio.js` (the disco loop in three layers and the sound effects, all synthesized with Web Audio at load), `src/hud.js`, `src/shared.js` (constants, tiers and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.
