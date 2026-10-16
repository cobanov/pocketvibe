# Controls on webOS

PocketVibe's buttons are A, B, X, Y, L, R, START, SELECT and a D-pad. On a TV they come from the remote, the Magic Remote pointer, or a gamepad.

## LG remote

| Remote key | PocketVibe | Notes |
|---|---|---|
| Arrow keys | D-pad | |
| OK | A | |
| Back | B | **Hold 0.5 s in a game: back to the launcher** |
| Red / Green | X / Y | |
| Yellow / Blue | L / R | tabs in the launcher |
| Rewind / Fast-forward | L / R | |
| Play / Pause | START | |
| Stop | SELECT | |
| INFO | | in a game: back to the launcher; in the launcher: gamepad setup |

At the launcher's root, B asks to quit the app.

## Magic Remote pointer

In pointer mode the remote sends mouse events instead of keys. In the launcher you can hover a game to select it, click to open or play,
click a tab, and use the scroll wheel to move. In a game, move the pointer to show a soft **Çıkış** (exit) button in the top right corner.
To play a game, hide the pointer by pressing an arrow key and use the remote's keys above.

## Gamepads (USB and Bluetooth)

1. Bluetooth: pair the pad in the TV's settings (Connection > Bluetooth). USB: plug it in.
2. Press a button on the pad. Browsers only expose a gamepad after the first press.
3. The launcher and games read the browser's Gamepad API. `webos-shim.js` first converts every pad to the standard layout PocketVibe expects.

| Pad | Layout |
|---|---|
| Xbox, PlayStation and most others | the **bottom** button is A (confirm), the right one is B (back) |
| Nintendo / 8BitDo style | the **right** button is A, the bottom one is B |

The choice is "Auto" by default; change it in **Gamepad setup** (INFO in the launcher, or open `http://127.0.0.1:8730/gamepad.html` in the app).

**Leave a game:** hold START + SELECT for 0.5 s, or press the pad's Guide/Home button.

### Gamepad setup page

- Shows every pad the TV exposes (name, whether it uses the standard mapping, which buttons and axes are pressed). If nothing shows, the TV does not expose the pad to apps.
- **Eşleştir** (map) walks through UP, DOWN, LEFT, RIGHT, A, B, X, Y, L, R, START, SELECT: press that button on the pad (OK on the remote skips a step). The mapping is saved on the TV (`padmap.json`) and applies to the launcher and every game.
- **Sıfırla** (reset) removes the saved mapping of the pad; **Düzen** cycles Auto / Nintendo / Xbox.
- Pads reporting a non-standard layout without a saved mapping are guessed from a common layout; run the setup for an exact mapping.
