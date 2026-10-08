# Contributing

Thanks for wanting to help. PocketVibe is small, and every kind of help counts.

## Ways to help

- **Try it on your handheld.** If it works on a handheld we have not tested, or breaks on one,
  [open an issue](https://github.com/cobanov/pocketvibe/issues) with the handheld, its system
  and version (ROCKNIX build or Android version), what you did and what happened.
- **Make a game.** Games go through the store, not pull requests: start with
  `npm create pocketvibe@latest`, and send it with `npx pocketvibe publish`.
  [Make a game](https://pocketvibe.cobanov.dev/make/) has the steps and what review checks.
- **Improve the app, the store or the website.** Pull requests are welcome. For something big,
  open an issue first so we can agree on the direction.

## Getting around

[Development](docs/development.md) explains every folder, how to run the launcher on your
computer, and how to put a build on a handheld. [How it works](https://pocketvibe.cobanov.dev/how/)
is the short version.

## Pull requests

- Keep each one to one change, and say how you tested it. Anything that touches `app/` should
  have run on a handheld.
- Write like the code around it: plain names, comments that say why, no new dependencies on the
  handheld (the service uses only Python's standard library).
- Documentation and READMEs are in English.
- AI-assisted contributions are welcome; say so in the pull request.

By contributing, you agree that your work is released under the [MIT license](LICENSE).
