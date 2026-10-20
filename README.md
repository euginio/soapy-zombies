# Picnic Ants

Español: [LEEME.md](LEEME.md)

Code tour: [GAME_GUIDE.md](GAME_GUIDE.md)

## About the game

Defend the food from the ants! Ants come in from the edges of the tray and head for the food. Tilt the tray to make them fall off: each ant that falls earns one point. An extra ant appears for every seven ants that fall. The game ends when all the food is gone.

## How to play

1. Open the game at [euginio.github.io/soapy-zombies](https://euginio.github.io/soapy-zombies).
2. Tap the screen to start. The game attempts to switch to fullscreen and landscape orientation.
3. Tilt the tray using the controls for your device. The tray, ants, and food lean in the same direction while the background and score stay fixed:
   - **Computer:** use the arrow keys to tilt it in that direction.
   - **Phone or tablet:** tilt your device. Motion sensors must be available to the browser; serve the game over HTTPS (localhost is also allowed). Tap **Re-center** while holding the device at the angle you want to treat as level.
   - To inspect mobile sensor readings, add `?sensorDebug=1` to the game URL. The readout follows the game into fullscreen.
4. Keep the ants away from the food and make them fall off the tray. Your score and high score are displayed; the high score is saved in your browser.

The game requires a Chrome-compatible browser. **It is not compatible with iPhone.**

## Run locally

Node.js and npm are required. From the project folder, run:

```sh
npm install
npm run dev
```

Vite opens `dev.html` for development. The root `index.html` remains the production entry point for GitHub Pages.

To toggle the ant debug colors, change `DEBUG_MODE` in `const/const.ts` and rebuild the production bundle.

## Run the checks and browser tests

Install Playwright's Chromium browser once. Then run the TypeScript check, gameplay-rule unit tests, and production/development browser tests:

```sh
npx playwright install chromium
npm run test:smoke
```
