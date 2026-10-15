# PocketVibe on PlayStation 5

A native PS5 homebrew title that runs PocketVibe games and the launcher
unchanged: the same Vite builds the handhelds get, in a small browser of its
own.

- `app/` is the native host (C): an OpenGL 4.6 context from ps5-opengl, the
  controller, QuickJS, and a bridge that lets scripts call GL by name. `text.c`
  draws text with the console's own fonts, `files.c` saves files and decodes
  pictures.
- `runtime/` is the browser the games see (JavaScript): WebGL 2 on top of the
  GL bridge (`webgl.js`), the DOM (`dom.js`), Canvas 2D (`canvas2d.js`), and an
  HTML/CSS engine for HUDs, menus and the launcher (`css.js`, `layout.js`,
  `hud.js`). `ps5launcher.js` answers the launcher's `/api` calls.
- `tools/` builds (`build-app.sh`), installs (`deploy.sh`), screenshots the
  console (`shot.sh`) and checks the HUD layout against Chrome (`hud-harness/`).

## Build and install

Docker (an x86-64 Ubuntu image with clang-18, see `tools/build-app.sh`), the
ps5-opengl SDK release and the ps5-native-app-boilerplate it pins, under
`~/Developer/ps5-homebrew/deps`. Then:

```sh
ps5/tools/build-app.sh games                       # every game's dist/ build, the launcher
PS5_PAYLOAD_SDK=... ps5/tools/deploy.sh ~/Developer/ps5-homebrew/work/app/dist/PPSA90550
```

On the console: the D-pad and Circle in the launcher, Options + touch pad
(START + SELECT) back to it from a game.

## License

The code in this folder is MIT, like the rest of PocketVibe. The PS5 title
built from it is GPL-3.0-or-later as a whole: it links ps5-opengl (Mesa on
the PS5's GPU, GPL-3.0-or-later) and is assembled with
ps5-native-app-boilerplate's tools and runtime module (GPL-3.0-or-later).
Whoever distributes the built title must offer this source with it, which
this repository does. Third-party code here: QuickJS-ng (MIT), stb_truetype
and stb_image (public domain / MIT).
