# Pole Star

A laid-back pole dance show for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Welcome to the Pole Star Lounge. Stella, a low-poly pole artist in a long-sleeved sequined unitard with a swinging ponytail, dances her routine to a disco loop on her own: walks round the pole, fireman and chair spins, pirouettes, a climb into an inverted straddle and the splits, a spiral down, the human flag. Throw her a dollar with A whenever you like: the bill flutters onto the stage and stays there, and she looks your way and waves thanks. Every tip brightens the lights, gets the front row moving and, once the club is lively, brings in the lead line of the music. Throw six within three seconds and she breaks into her showpiece, a flag spinning so fast that the money on the stage swirls up round the pole. No score, no timer: just the show.

| Button | Action |
|---|---|
| A | Throw a dollar |
| START | Pause / resume |

Code: `src/main.js` (tips, the club's energy, her thanks, the crowd's reactions, camera), `src/dancer.js` (Stella's model and skeleton, her routine with every move as a function of the beat, blending between moves, IK that keeps her hands on the pole, the ponytail as a small Verlet chain), `src/money.js` (the bills: flight, the pile on the stage and the swirl, one InstancedMesh), `src/club.js` (stage, pole, curtains, neon sign, disco ball and its spots, light beams, bulbs, speakers and the front row), `src/audio.js` (the disco loop in three layers and the sound effects, all synthesized with Web Audio at load), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.
