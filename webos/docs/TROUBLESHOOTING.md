# Troubleshooting

The app logs to **`/media/developer/pocketvibe/log.txt`** on the TV (read it over SSH, or with `ares-shell --device tv`). Browser errors also appear for a few seconds as a red strip at the bottom of the screen and are copied to the log.

| Symptom | Likely cause and what to do |
|---|---|
| The start screen says the TV lacks Chromium 68 or WebGL2 | The TV's web engine is too old (webOS 4.x). These games need WebGL2; there is no workaround. |
| Start screen: "service did not start" | The Node.js service did not come up. Over SSH run `node pocketvibed.js` (or `./run-standalone.sh`) inside the service folder, typically `/media/developer/apps/usr/palm/services/com.pocketvibe.app.service/`, and read the output. |
| Store is empty / "offline" | Check `log.txt` for `catalog ... failed`. Certificate errors retry once with a bundled CA list; a wrong TV clock also breaks HTTPS. |
| A store game does nothing or shows a red `SyntaxError` | The game was not rewritten for Chromium 68. Look in `log.txt` for `esbuild unavailable` or `lower failed`. The helper is unpacked to `/media/developer/pocketvibe/bin/esbuild` (or `/tmp/pv-esbuild`); both need permission to run binaries. |
| No sound | Browsers keep audio suspended until a key or click. Press a button in the game. After about 6 s the log has an `audio <state>/<rate> vis=...` line: `suspended` means the browser still blocks it. |
| Gamepad not responding | Open Gamepad setup (INFO in the launcher). Nothing listed: the TV does not expose the pad (try another USB port, re-pair Bluetooth, press a button). Listed with "unknown layout": run **Eşleştir**. |
| Wrong buttons for confirm/back | Change **Düzen** in Gamepad setup. |
| Install times out | Try again, or copy the `.ipk` to the TV and install from there. The `.ipk` is about 12 MB. |
| Low memory, games crash | Close other apps; keep menu music off; the TV has little spare RAM. |

Useful files on the TV: `log.txt`, `settings.json`, `padmap.json`, `games/<id>/` (a `.pv-lowered-1` file marks a game as already rewritten).
