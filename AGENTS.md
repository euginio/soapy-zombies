# Agent instructions

Rules and context for any AI agent (or new contributor) working in this repository.
Read this first, then [GAME_GUIDE.md](GAME_GUIDE.md) for the code map and event flows.

## Project snapshot

- **Ants Feast** (repo `soapy-zombies`, package `picnic-ants`): a landscape, tilt-controlled
  browser game. The player tilts the tray (device sensors, or arrow keys on desktop) so ants fall
  off while the food is protected.
- Stack: Phaser 3.90, TypeScript 5.9, Vite 8 (IIFE library build to `dist/bundle.js`).
- Published on GitHub Pages (`https://euginio.github.io/soapy-zombies`) by the GitHub Actions
  workflow `.github/workflows/deploy-pages.yml`. On every push to `master` it runs
  `npm run test:smoke`, and only if that passes it publishes `index.html`, `dist/` and the images
  in `assets/images/`. `dist/` is **not committed**: it is
  gitignored and built in CI.
- Layout:
  - `game.ts` - Phaser config and entry point.
  - `scenes/` - `boot-scene`, `title-scene`, `game-scene` (plus `my-scene` base class).
  - `objects/` - `Ant`, `Food`, `MySprite` base class.
  - `services/` - `wake-lock` Screen Wake Lock manager.
  - `game-rules.ts` - **pure** game logic (no Phaser/DOM). Unit tested in `tests/game-rules.test.ts`.
  - `tests/game.spec.js` - Playwright browser tests (production build and Vite dev server).
  - `backlog` - the owner's ideas, problems and done list. It states intent; read it before
    making product decisions.

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Node tests for `game-rules.ts` |
| `npm run build` | Vite build into `dist/` (gitignored, generated) |
| `npm run test:browser` | Playwright (needs a built `dist/`, so run `npm run build` first on a fresh clone) |
| `npm run test:smoke` | Typecheck + unit + build + browser. Same as CI, run it after code changes |
| `npm run dev` | Dev server on `/dev.html` |

> The browser step can fail with `Timed out waiting 30000ms from config.webServer` when the Vite
> dev server is slow to start (cold start on Windows). Re-run `npm run test:browser` before
> treating it as a real failure.

## Working rules

1. **Reply to the user in English.** Code comments are in English too.
2. **Verify your work.** Run `npm run test:smoke` after code changes. Behaviour changes need a
   test: put pure rules in `game-rules.ts` with a unit test, and UI/scene behaviour in
   `tests/game.spec.js`.
3. **Push finished changes to GitHub.** Per the owner's instruction, once changes are verified
   with `npm run test:smoke` and committed to `master`, push them to `origin/master` so the GitHub
   Actions deployment workflow runs and updates the public site. Never amend or rewrite history
   unless the owner explicitly asks for it.
4. **Commit after every finished change, but only if the working tree was clean before you
   started.** Pre-existing unrelated uncommitted work means: do not commit, tell the owner.
   - Stage explicit paths. Do not use `git add -A`.
   - Use a conventional message: `type(scope): short summary` (`fix`, `feat`, `refactor`, `test`,
     `docs`, `chore`) and a body explaining *why*, not a copy of your chat summary.
   - `dist/` is gitignored generated output, so builds and test runs do not dirty the tree.
   - Finish by telling the owner what was committed (hash and message) so it can be checked.
5. **Preserve existing comments and docstrings** that are unrelated to your change, including
   commented-out code. Remove dead *code*, not the owner's notes. Add short comments that explain
   *why* when the logic is not obvious.
6. **Ask before product decisions** (browser support gating, difficulty balance, UI text,
   controls). The `backlog` file records deliberate choices, for example Firefox was gated on
   purpose until it is tested.
7. Keep changes focused. Do not reformat files you are not changing.
8. **Whenever the owner gives a general instruction, add it to this file** (as a new rule or in
   the relevant section) in the same change, so future agents follow it too.
9. **Never wait indefinitely for tests or commands.** A full smoke test run takes about 1 to 1.5
   minutes. If a command or test run takes longer than 2-3 minutes, it indicates an unconstrained
   command, an orphaned process holding ports, or a hang: kill it immediately and investigate
   rather than waiting passively.

## Conventions and gotchas

- **Line endings are CRLF** (`core.autocrlf=true`, no `.gitattributes`). Edit tools that match
  multi-line text often fail on CRLF. Match single lines, or use a script, and make sure the file
  has no bare LF line endings afterwards.
- Follow each file's existing indentation (`scenes/` and `game-rules.ts` use 2 spaces, `objects/`
  uses 4). There is no linter or formatter yet.
- `Ant` and `Food` call `init()` at the end of their constructors, which reads `scene.tray`.
  Always create the tray before creating ants and food.
- Scene instances are reused by Phaser. Reset state in `init()`/`create()` and release listeners
  and DOM layers on `SHUTDOWN` (see `GameScene.destroyVisualLayers` and `removeMotionListeners`).
- Browser tests rely on stable hooks, so do not rename them without updating the tests:
  - `window.__gameSceneForTest` / `window.__titleSceneForTest` (exposed by patching
    `SceneManager.start` inside the tests).
  - DOM ids `#tilting-board`, `#stationary-hud`, `#high-score-label`, `#game-over-overlay`,
    `#game-over-restart`, `#game-over-home`, `#recenter-device-tilt`, `#sound-toggle`,
    `#fullscreen-toggle`, `#fullscreen-prompt-overlay`, `#pause-toggle`, `#pause-overlay`, `#pause-resume`, `#pause-restart`, `#pause-home`.
  - The `highScore` localStorage key.
- UI text is currently mixed Spanish/English (the game-over overlay is Spanish). Keep it
  consistent with the surrounding text until i18n is done.

## Known open improvements

Identified in the project analysis and not done yet:

- Add ESLint and Prettier, and tighten `tsconfig.json` (`strict`, `module`/`target` for Vite).
- Split `GameScene` (visual DOM layers and input handling should be separate classes).
- Difficulty balance, tutorial, virtual joystick customization.
