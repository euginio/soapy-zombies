# Picnic Ants

Español: [LEEME.md](LEEME.md)

## About the game

Defend the food from the ants! Ants come in from the edges of the tray and head for the food. Tilt the tray to make them fall off: each ant that falls earns one point. An extra ant appears for every seven ants that fall. The game ends when all the food is gone.

## How to play

1. Open the game at [euginio.github.io/soapy-zombies](https://euginio.github.io/soapy-zombies).
2. Tap the screen to start. The game attempts to switch to fullscreen and landscape orientation.
3. Tilt the tray using the controls for your device:
   - **Computer:** use the arrow keys to tilt it in that direction.
   - **Phone or tablet:** tilt your device.
4. Keep the ants away from the food and make them fall off the tray. Your score and high score are displayed; the high score is saved in your browser.

The game requires a Chrome-compatible browser. **It is not compatible with iPhone.**

## Run locally

Node.js and npm are required. From the project folder, run:

```sh
npm install
npm run dev
```

Vite opens `dev.html` for development. The root `index.html` remains the production entry point for GitHub Pages.

## Run the browser smoke test

Install Playwright's Chromium browser once, then run the production and development smoke tests:

```sh
npx playwright install chromium
npm run test:smoke
```
