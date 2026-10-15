# PocketVibe on PlayStation 5

A native PS5 homebrew title that runs PocketVibe games and the launcher
unchanged: the same Vite builds the handhelds get, in a small browser of its
own.

- `app/` is the native host (C): an OpenGL 4.6 context from ps5-opengl, the
  controller, QuickJS, and a bridge that lets scripts call GL by name. `text.c`
  draws text with the console's own fonts, `files.c` saves files and decodes
  pictures, `audio.c` is Web Audio's engine on the console's audio output,
  `http.c` downloads from the store over HTTPS (the console's sceHttp and
  certificates) and unpacks games.
- `runtime/` is the browser the games see (JavaScript): WebGL 2 on top of the
  GL bridge (`webgl.js`), the DOM (`dom.js`), Canvas 2D (`canvas2d.js`), and an
  HTML/CSS engine for HUDs, menus and the launcher (`css.js`, `layout.js`,
  `hud.js`), Web Audio (`audio.js`). `ps5launcher.js` answers the launcher's
  `/api` calls: the library, settings, and the store, whose games install to
  `/data/pocketvibe/games/<id>` and run from there.
- `tools/` builds (`build-app.sh`), installs (`deploy.sh`), screenshots the
  console (`shot.sh`) and checks the HUD layout against Chrome (`hud-harness/`).
  `background.swift` and `bc7dds.c` make the home screen's background from the
  games' covers; the tile is the iPhone app's icon.

## Build and install

Docker (an x86-64 Ubuntu image with clang-18, see `tools/build-app.sh`), the
ps5-opengl SDK release and the ps5-native-app-boilerplate it pins, under
`~/Developer/ps5-homebrew/deps`. Then:

```sh
ps5/tools/build-app.sh games                       # every game's dist/ build, the launcher
PS5_PAYLOAD_SDK=... ps5/tools/deploy.sh ~/Developer/ps5-homebrew/work/app/dist/PPSA90550
```

On the console Cross is A (choose) and Circle is B (back), as PlayStation
games have them; Square is X and Triangle Y, the touch pad SELECT and Options
START. Hold the touch pad for a second (or press Options + touch pad) to leave
a game for the launcher. The launcher keeps to the TV's title-safe area and
shows the PlayStation symbols (`?buttons=ps`).

## License

The code in this folder is MIT, like the rest of PocketVibe. The PS5 title
built from it is GPL-3.0-or-later as a whole: it links ps5-opengl (Mesa on
the PS5's GPU, GPL-3.0-or-later) and is assembled with
ps5-native-app-boilerplate's tools and runtime module (GPL-3.0-or-later).
Whoever distributes the built title must offer this source with it, which
this repository does. Third-party code here: QuickJS-ng (MIT), stb_truetype,
stb_image and stb_vorbis (public domain / MIT).
