# Game code guide

This guide is for learning how the game works by following its runtime flow. The source code is the reference; this document gives you a map and a few paths to trace.

## Start with the runtime flow

The game starts in `game.ts`. Phaser creates one game using the configuration there and registers three scenes in order:

1. `BootScene` loads the images and sprite sheets in `scenes/boot-scene.ts`.
2. `TitleScene` shows the start screen in `scenes/title-scene.ts`.
3. `GameScene` creates and runs a round in `scenes/game-scene.ts`.

Phaser scenes have lifecycle methods. `preload()` loads assets, `create()` builds the scene after loading, and `update()` runs repeatedly while the scene is active. `MyScene` (`scenes/my-scene.ts`) is a small shared base class that reads the configured game dimensions.

## Who owns what?

- **`GameScene`** coordinates a round: creates the tray, ants, food, collisions, score and controls; responds when an ant escapes or food is eaten; and handles game over.
- **`Ant`** (`objects/ant.ts`) owns an ant's movement and lifecycle. It chooses the nearest available food, faces and moves toward it, checks whether it is still on the tray, and reports when it falls.
- **`Food`** (`objects/food.ts`) chooses a random sprite and tray position, and plays an animation when an ant eats it. Its `destroy()` method tells the scene to reduce the remaining food count.
- **`MySprite`** (`objects/mySprite.ts`) is the shared Phaser arcade-physics sprite base for ants and food.
- **`game-rules.ts`** contains small calculations and decisions without Phaser objects or DOM. This makes game rules easier to understand and test independently.
- **`const/const.ts`** contains shared settings, including optional ant debug colors.

## Follow one round

1. `GameScene.init()` resets the score and game-over state. `GameScene.create()` builds a fresh board and its objects.
2. Phaser calls `GameScene.update()` every frame. It reads keyboard or device input and applies the board's visual tilt.
3. Each ant's `update()` runs because the ant group enables child updates. The ant picks the nearest active food and moves toward it. The current gravity is added to its food-seeking velocity.
4. Phaser detects ant/food collisions and calls `GameScene.eatFood()`. The food shrinks away; when its animation finishes, `Food.destroy()` reports the loss to `GameScene.destroyFood()`.
5. If the last food is eaten, `GameScene.overGame()` saves a new high score if needed, shows the game-over dialog, and pauses physics and animations.
6. When an ant leaves the tray, `Ant.kill()` reports it through `GameScene.antDied()`. The score increases, and `game-rules.ts` decides whether to add a replacement ant.

## Understand the controls and display

On desktop, `checkCursors()` converts arrow keys into gravity values. On a tablet, device orientation is measured relative to a baseline: the first sensor reading becomes the neutral angle, and **Re-center** replaces that baseline. `calculateDeviceTilt()` in `game-rules.ts` accounts for screen rotation and clamps the result to a normalized range. Gravity affects ant movement; the visual tilt is applied separately to the canvas.

The canvas tilts, but the grass and HUD are HTML elements positioned around it. `createVisualLayers()` creates those elements; `syncVisualLayerBounds()` keeps them aligned when the canvas or its parent changes size or position. This separation keeps the background and score still while the board moves. `destroyVisualLayers()` and `removeMotionListeners()` undo those DOM changes and browser event listeners when the scene ends or restarts.

## A good way to explore

Use your editor's “Go to Definition” on a method call and follow one event from caller to effect. Useful traces are:

- **Ant falls:** `Ant.update()` → `Ant.kill()` → `GameScene.antDied()` → `resolveAntEscape()`.
- **Food is eaten:** `GameScene.eatFood()` → `Food.beingEat()` → `Food.destroy()` → `GameScene.destroyFood()` → `resolveFoodLoss()`.
- **Tablet tilt:** device orientation handler in `GameScene.create()` → `calculateDeviceTilt()` → gravity and canvas transform.
- **Restart:** game-over button → `GameScene.restart()` → cleanup → Phaser scene restart → `GameScene.create()`.

The tests in `tests/game-rules.test.ts` cover the standalone rule calculations. Browser behavior is exercised by `tests/game.spec.js`.

## Key terms

- **Scene:** a Phaser-managed screen or game state.
- **Sprite:** an image object that can participate in physics and animation.
- **Group:** a collection of game objects, such as all ants or all food.
- **Collider:** a Phaser physics relationship that invokes a callback when objects touch.
- **HUD:** the score and other information displayed over the game.
- **Baseline:** the device angle treated as neutral; tilting is measured relative to it.
- **Lifecycle:** the sequence of setup, repeated updates, and cleanup for a scene or object.
