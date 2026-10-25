const { expect, test } = require("@playwright/test");

const DEVELOPMENT_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_DEV_PORT || 4174}/dev.html`;

const REQUIRED_ASSETS = [
  "/assets/images/grass.png",
  "/assets/images/trayWithCompleteClothe.png",
  "/assets/images/food.png",
  "/assets/images/ant_sheet.png",
  "/assets/images/caterpillar.png",
  "/assets/audio/music.ogg",
  "/assets/audio/ant-fall.ogg",
  "/assets/audio/food-eaten.ogg",
  "/assets/audio/game-over.ogg",
  "/assets/audio/ui-tap.ogg",
  "/assets/audio/ui-toggle.ogg"
];

// Simulates the asynchronous fullscreen transition of the real Fullscreen API:
// the requesting element becomes the fullscreen element of the document and a
// fullscreenchange event is dispatched afterwards.
async function stubFullscreen(page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function () {
      const target = this;
      setTimeout(() => {
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          get: () => target
        });
        document.dispatchEvent(new Event("fullscreenchange"));
      }, 0);
      return Promise.resolve();
    };
  });
}

// Simulates a browser that refuses to enter fullscreen.
async function stubRejectedFullscreen(page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = function () {
      setTimeout(() => document.dispatchEvent(new Event("fullscreenerror")), 0);
      return Promise.resolve();
    };
  });
}

async function stubOrientationLock(page) {
  await page.addInitScript(() => {
    window.__orientationLockCalls = [];
    screen.orientation.lock = function (type) {
      window.__orientationLockCalls.push({
        type,
        fullscreenActive: Boolean(document.fullscreenElement)
      });
      return Promise.resolve();
    };
  });
}

async function exposeScenesForTest(page) {
  await page.addInitScript(() => {
    window.addEventListener("load", () => {
      const sceneManager = window.Phaser.Scenes.SceneManager.prototype;
      const startScene = sceneManager.start;
      sceneManager.start = function (key, ...args) {
        const result = startScene.call(this, key, ...args);
        if (key === "GameScene") {
          window.__gameSceneForTest = this.getScene(key);
        }
        if (key === "TitleScene") {
          window.__titleSceneForTest = this.getScene(key);
        }
        return result;
      };
    }, { once: true });
  });
}

async function stubFullscreenAndExposeScenes(page) {
  await stubFullscreen(page);
  await exposeScenesForTest(page);
}

async function clickStartOnCanvas(page, input = "mouse") {
  const canvas = page.locator("#game canvas").first();
  await expect(canvas).toBeVisible();
  // Boot loads and decodes the images and audio first; a tap before the title scene is created would be lost.
  await page.waitForFunction(() => Boolean(window.__titleSceneForTest?.startTxt));
  const bounds = await canvas.boundingBox();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height * 0.75;
  if (input === "touch") {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  return canvas;
}

async function waitForGameScene(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__gameSceneForTest))).toBe(true);
}

async function readGameState(page) {
  return page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    return {
      score: gameScene.score,
      scoreText: gameScene.scoreText.text,
      highScoreText: gameScene.highScoreText.text,
      foodCount: gameScene.foodCount,
      foodSprites: gameScene.foods.getChildren().length,
      availableFood: gameScene.foods.getChildren().filter((food) => food.body.enable).length,
      antSprites: gameScene.ants.getChildren().length,
      gameOver: Boolean(gameScene.gameOver),
      gravity: { x: gameScene.gravity.x, y: gameScene.gravity.y },
      highScore: localStorage.getItem("highScore")
    };
  });
}

async function expectGameLoads(page, url) {
  const pageErrors = [];
  const failedResponses = [];
  const loadedAssets = new Set();

  await stubFullscreenAndExposeScenes(page);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (REQUIRED_ASSETS.includes(pathname) && response.ok()) {
      loadedAssets.add(pathname);
    }
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(url);
  await expect(page).toHaveTitle("Ants Feast");
  await clickStartOnCanvas(page);
  await expect(page.locator("#tilting-board")).toBeVisible();
  await expect.poll(() => [...loadedAssets]).toHaveLength(REQUIRED_ASSETS.length);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
}

test("production build loads its assets and starts a game", async ({ page }) => {
  await expectGameLoads(page, "/");
});

test("both pages define a mobile viewport", async ({ page }) => {
  await stubFullscreen(page);
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("width=device-width");
  expect(content).toContain("initial-scale=1");
  await page.goto(DEVELOPMENT_URL);
  await expect(page.locator('head meta[name="viewport"]')).toHaveAttribute("content", content);
});

test("Vite development server loads its assets and starts a game", async ({ page }) => {
  await expectGameLoads(page, DEVELOPMENT_URL);
});

test("tilt controls apply perspective on both axes", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  const canvas = await clickStartOnCanvas(page);
  const tiltedBoard = page.locator("#tilting-board");
  const stationaryHud = page.locator("#stationary-hud");
  await expect(tiltedBoard).toBeVisible();
  await expect(stationaryHud).toBeVisible();
  expect(await tiltedBoard.evaluate((element) => element.tagName)).toBe("CANVAS");
  expect(await page.locator("#game").locator("#stationary-hud").count()).toBe(1);
  await waitForGameScene(page);
  await expect.poll(() => page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      trayVisible: scene.tray.visible,
      visibleAnts: scene.ants.getChildren().filter((ant) => ant.visible).length,
      visibleFoods: scene.foods.getChildren().filter((food) => food.visible && food.body.enable).length,
      hudText: document.querySelector("#stationary-hud").textContent
    };
  })).toMatchObject({
    trayVisible: true,
    visibleAnts: 4,
    visibleFoods: 8,
    hudText: "0HI 0"
  });

  const anchoredLayout = await page.evaluate(() => {
    const canvas = document.querySelector("#tilting-board");
    const hudBounds = document.querySelector("#stationary-hud").getBoundingClientRect();
    return {
      marginLeft: canvas.style.marginLeft,
      marginTop: canvas.style.marginTop,
      hudX: hudBounds.x,
      hudY: hudBounds.y
    };
  });

  const alignedBounds = await Promise.all([
    canvas.boundingBox(),
    stationaryHud.boundingBox()
  ]);
  for (const dimension of ["x", "y", "width", "height"]) {
    expect(Math.abs(alignedBounds[1][dimension] - alignedBounds[0][dimension])).toBeLessThan(0.1);
  }

  const directions = [
    ["ArrowRight", "perspective(900px) rotateX(0deg) rotateY(10deg)", { x: 30, y: 0 }],
    ["ArrowLeft", "perspective(900px) rotateX(0deg) rotateY(-10deg)", { x: -30, y: 0 }],
    ["ArrowUp", "perspective(900px) rotateX(10deg) rotateY(0deg)", { x: 0, y: -30 }],
    ["ArrowDown", "perspective(900px) rotateX(-10deg) rotateY(0deg)", { x: 0, y: 30 }]
  ];
  for (const [key, expectedTransform, expectedGravity] of directions) {
    await page.keyboard.down(key);
    try {
      await expect
        .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
        .toBe(expectedTransform);
      await expect.poll(() => page.evaluate(() => ({
        x: window.__gameSceneForTest.gravity.x,
        y: window.__gameSceneForTest.gravity.y
      }))).toEqual(expectedGravity);
      await expect(stationaryHud).toHaveCSS("transform", "none");
      await expect.poll(() => page.evaluate(() => {
        const canvas = document.querySelector("#tilting-board");
        const hudBounds = document.querySelector("#stationary-hud").getBoundingClientRect();
        return {
          marginLeft: canvas.style.marginLeft,
          marginTop: canvas.style.marginTop,
          hudX: hudBounds.x,
          hudY: hudBounds.y
        };
      })).toEqual(anchoredLayout);
    } finally {
      await page.keyboard.up(key);
    }
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("perspective(900px) rotateX(0deg) rotateY(0deg)");
  }

  await page.keyboard.down("ArrowRight");
  try {
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("perspective(900px) rotateX(0deg) rotateY(10deg)");
    const canvasStyleMutations = await page.evaluate(async () => {
      const canvas = document.querySelector("#tilting-board");
      const mutations = [];
      const observer = new MutationObserver((records) => mutations.push(...records));
      observer.observe(canvas, { attributes: true, attributeFilter: ["style"] });
      window.__gameSceneForTest.syncVisualLayerBounds(canvas);
      window.__gameSceneForTest.update();
      await new Promise((resolve) => queueMicrotask(resolve));
      observer.disconnect();
      return mutations.length;
    });
    expect(canvasStyleMutations).toBe(0);
  } finally {
    await page.keyboard.up("ArrowRight");
  }

  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowUp");
  try {
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("perspective(900px) rotateX(10deg) rotateY(10deg)");
    await expect.poll(() => page.evaluate(() => ({
      x: window.__gameSceneForTest.gravity.x,
      y: window.__gameSceneForTest.gravity.y
    }))).toEqual({ x: 30, y: -30 });
    await expect(stationaryHud).toHaveCSS("transform", "none");
  } finally {
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("ArrowUp");
  }
});

test("tablet orientation tilts the board and re-centers from the current angle", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: false,
    hasTouch: true,
    viewport: { width: 800, height: 1280 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  });

  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page, "touch");

    const tiltedBoard = page.locator("#tilting-board");
    await expect(tiltedBoard).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new DeviceMotionEvent("devicemotion", {}));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 0,
        gamma: 0
      }));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 0,
        gamma: 30
      }));
    });

    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("perspective(900px) rotateX(0deg) rotateY(10deg)");
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 30, y: 0 } });
    const recenterButton = page.locator("#recenter-device-tilt");
    await expect(recenterButton).toBeVisible();
    await recenterButton.click();
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 0, y: 0 } });
    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 0,
        gamma: 45
      }));
    });
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 15, y: 0 } });
    await page.evaluate(() => {
      const target = document.createElement("div");
      target.id = "simulated-fullscreen-target";
      target.style.cssText = "position:relative;width:580px;height:300px";
      document.body.appendChild(target);
      window.__gameCanvasForFullscreenTest = document.querySelector("#tilting-board");
      window.__originalCanvasParentForFullscreenTest = window.__gameCanvasForFullscreenTest.parentElement;
      target.appendChild(window.__gameCanvasForFullscreenTest);
    });
    await expect.poll(() => page.evaluate(() => {
      const fullscreenTarget = document.querySelector("#simulated-fullscreen-target");
      return [
        document.querySelector("#tilting-board").parentElement === fullscreenTarget,
        document.querySelector("#stationary-hud").parentElement === fullscreenTarget,
        document.querySelector("#game-over-overlay").parentElement === fullscreenTarget,
        document.querySelector("#recenter-device-tilt").parentElement === fullscreenTarget
      ];
    })).toEqual([true, true, true, true]);
    await page.evaluate(() => {
      window.__originalCanvasParentForFullscreenTest.appendChild(window.__gameCanvasForFullscreenTest);
      delete window.__gameCanvasForFullscreenTest;
      delete window.__originalCanvasParentForFullscreenTest;
      document.querySelector("#simulated-fullscreen-target").remove();
    });
    await expect.poll(() => page.evaluate(() => {
      const canvasParent = document.querySelector("#tilting-board").parentElement;
      return ["#tilting-board", "#stationary-hud", "#game-over-overlay", "#recenter-device-tilt"]
        .every((selector) => document.querySelector(selector)?.parentElement === canvasParent);
    })).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("game over shows the score and offers restart and home actions", async ({ page }) => {
  const pageErrors = [];
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("highScore", "2");
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await clickStartOnCanvas(page);
  await expect(page.locator("#tilting-board")).toBeVisible();
  await waitForGameScene(page);

  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() => page.locator("#tilting-board").evaluate((element) => element.style.transform))
    .toBe("perspective(900px) rotateX(0deg) rotateY(10deg)");

  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.score = 5;
    gameScene.scoreText.setText("5");
    gameScene.foods.getChildren().slice().forEach((food) => food.destroy());
  });

  await expect.poll(() => readGameState(page)).toMatchObject({
    gameOver: true,
    foodCount: 0,
    highScore: "5"
  });
  const gameOverOverlay = page.locator("#game-over-overlay");
  await expect(gameOverOverlay).toBeVisible();
  await expect(gameOverOverlay).toContainText("¡Fin de la partida!");
  await expect(gameOverOverlay.locator("#game-over-score")).toHaveText("5");
  await expect(gameOverOverlay.locator("#game-over-record")).toHaveText("5");
  await expect
    .poll(() => page.locator("#tilting-board").evaluate((element) => element.style.transform))
    .toBe("perspective(900px) rotateX(0deg) rotateY(0deg)");
  await page.keyboard.up("ArrowRight");

  await page.locator("#game-over-restart").click();
  await expect.poll(() => readGameState(page)).toMatchObject({
    gameOver: false,
    score: 0,
    foodCount: 8,
    availableFood: 8,
    highScoreText: "HI 5",
    highScore: "5"
  });
  await expect(page.locator("#stationary-background")).toHaveCount(1);
  await expect(page.locator("#stationary-hud")).toHaveCount(1);
  await expect(page.locator("#game-over-overlay")).toHaveCount(1);

  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.foods.getChildren().slice().forEach((food) => food.destroy());
  });
  await expect(page.locator("#game-over-overlay")).toBeVisible();
  await page.locator("#game-over-home").click();
  await expect.poll(() => page.evaluate(() => Boolean(
    window.__titleSceneForTest?.sys.isActive()
  ))).toBe(true);
  await expect(page.locator("#stationary-background")).toHaveCount(0);
  await expect(page.locator("#stationary-hud")).toHaveCount(0);
  await expect(page.locator("#game-over-overlay")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("new game shows the saved high score and starting ant and food counts", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("highScore", "9");
  });

  await page.goto("/");
  await clickStartOnCanvas(page);
  await expect(page.locator("#tilting-board")).toBeVisible();
  await expect.poll(() => readGameState(page)).toMatchObject({
    score: 0,
    scoreText: "0",
    highScoreText: "HI 9",
    foodCount: 8,
    foodSprites: 8,
    availableFood: 8,
    antSprites: 4
  });
});

test("an ant that leaves the tray awards a point through the fall path", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const before = await readGameState(page);
  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.ants.getChildren().forEach((ant, index) => {
      if (index === 0) {
        ant.isClimbing = false;
        ant.isAlive = true;
        ant.setPosition(-200, -200);
        return;
      }
      ant.isAlive = false;
      ant.isClimbing = true;
    });
  });

  await expect.poll(() => readGameState(page)).toMatchObject({
    score: before.score + 1,
    scoreText: String(before.score + 1),
    antSprites: before.antSprites
  });
});

test("falling ants raise the score and spawn an extra ant every seventh escape", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const before = await readGameState(page);
  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    for (let index = 0; index < 7; index++) {
      gameScene.antDied(gameScene.ants.getChildren()[0]);
    }
  });

  await expect.poll(() => readGameState(page)).toMatchObject({
    score: before.score + 7,
    scoreText: String(before.score + 7),
    antSprites: before.antSprites + 1
  });
});

test("eating food lowers the remaining count without a new high score when tied", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("highScore", "4");
  });

  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // Freeze the living ants *and* undo any eat tween they managed to start
  // between scene creation and this evaluate: ants now genuinely bite food
  // within their first walk step (~1.5s after creation), and several such
  // bites would otherwise race the exact transient count we assert on below.
  const prepped = await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.ants.getChildren().forEach((ant) => {
      ant.isAlive = false;
      ant.setVelocityX(0);
      ant.setVelocityY(0);
      ant.disableBody(true, false);
    });
    gameScene.caterpillars?.getChildren().forEach((caterpillar) => {
      caterpillar.isAlive = false;
      caterpillar.setVelocityX(0);
      caterpillar.setVelocityY(0);
      caterpillar.disableBody(true, false);
    });
    gameScene.foods.getChildren().forEach((food) => {
      gameScene.tweens.killTweensOf(food);
      food.isBeingEaten = false;
      if (food.body.enable) {
        food.setScale(1.5);
      }
    });
    gameScene.score = 4;
    gameScene.scoreText.setText("4");
    const targetFood = gameScene.foods.getChildren()[0];
    gameScene.eatFood(gameScene.ants.getChildren()[0], targetFood);
    gameScene.eatFood(gameScene.ants.getChildren()[0], targetFood);
    return {
      tweenCount: gameScene.tweens.getTweensOf(targetFood).length,
      foodCount: gameScene.foodCount,
      availableFood: gameScene.foods.getChildren().filter((food) => food.body.enable).length,
      isBeingEaten: targetFood.isBeingEaten,
      scaleDuringEating: targetFood.scaleX,
      textureKey: targetFood.texture.key
    };
  });
  expect(prepped.foodCount).toBe(8);
  expect(prepped.availableFood).toBe(8);
  expect(prepped.tweenCount).toBe(1);
  expect(prepped.isBeingEaten).toBe(true);
  expect(prepped.scaleDuringEating).toBeGreaterThanOrEqual(1.4);
  expect(prepped.textureKey).toContain("eaten_food_");

  await expect.poll(() => readGameState(page), { timeout: 8_000 }).toMatchObject({
    foodCount: 7,
    availableFood: 7,
    gameOver: false,
    highScore: "4"
  });

  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.foods.getChildren().slice().forEach((food) => {
      if (food.body.enable) {
        food.destroy();
      }
    });
  });

  await expect.poll(() => readGameState(page)).toMatchObject({
    gameOver: true,
    foodCount: 0,
    highScore: "4"
  });
});

test("devicemotion fallback tilts the board according to screen orientation until deviceorientation takes over", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const tiltedBoard = page.locator("#tilting-board");
  await page.evaluate(() => {
    Object.defineProperty(screen, "orientation", {
      configurable: true,
      value: { angle: 90 }
    });
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
      accelerationIncludingGravity: { x: 2.5, y: 5, z: 8 }
    }));
  });

  await expect.poll(() => readGameState(page)).toMatchObject({
    gravity: {
      x: expect.closeTo(30, 5),
      y: expect.closeTo(15, 5)
    }
  });
  await expect
    .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
    .toBe("perspective(900px) rotateX(-5deg) rotateY(10deg)");

  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
      beta: 0,
      gamma: 0
    }));
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
      accelerationIncludingGravity: { x: 5, y: 5, z: 0 }
    }));
  });
  await expect.poll(() => readGameState(page)).toMatchObject({
    gravity: { x: 0, y: 0 }
  });
});

test("phones skip the tablet re-center control", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"
  });

  try {
    const page = await context.newPage();
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page, "touch");
    await expect(page.locator("#tilting-board")).toBeVisible();
    await expect(page.locator("#recenter-device-tilt")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("non-Chrome browsers can start the game", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
  });

  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page);
    await waitForGameScene(page);

    await expect(page.locator("#tilting-board")).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("repeated taps on the title screen start the game only once", async ({ page }) => {
  await stubFullscreen(page);
  await exposeScenesForTest(page);
  await page.addInitScript(() => {
    window.__gameSceneStarts = 0;
    window.addEventListener("load", () => {
      const sceneManager = window.Phaser.Scenes.SceneManager.prototype;
      const startScene = sceneManager.start;
      sceneManager.start = function (key, ...args) {
        if (key === "GameScene") {
          window.__gameSceneStarts += 1;
        }
        return startScene.call(this, key, ...args);
      };
    }, { once: true });
  });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await clickStartOnCanvas(page);
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => window.__gameSceneStarts)).toBe(1);
});

test("the game still starts when localStorage is unavailable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await expect(page.locator("#high-score-label")).toHaveText("HI 0");
  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.score = 3;
    gameScene.overGame();
  });
  await expect(page.locator("#game-over-overlay")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
test("background music plays during a round, pauses at game over, and resumes on restart", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const musicState = () => page.evaluate(() => {
    const music = window.__gameSceneForTest.sound.get("music");
    return { exists: Boolean(music), playing: Boolean(music?.isPlaying), loop: Boolean(music?.loop) };
  });
  await expect.poll(musicState).toEqual({ exists: true, playing: true, loop: true });

  await page.evaluate(() => window.__gameSceneForTest.overGame());
  await expect.poll(musicState).toMatchObject({ exists: true, playing: false });

  await page.locator("#game-over-restart").click();
  await expect.poll(musicState).toEqual({ exists: true, playing: true, loop: true });
  expect(await page.evaluate(() => window.__gameSceneForTest.sound.getAll("music").length)).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("the sound button mutes and unmutes the game and remembers the choice", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const toggle = page.locator("#sound-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // The button is its own layer, so the HUD keeps containing only the score text.
  await expect(page.locator("#stationary-hud")).toHaveText("0HI 0");
  const soundState = () => page.evaluate(() => ({
    muted: window.__gameSceneForTest.sound.mute,
    stored: localStorage.getItem("soundMuted")
  }));

  await toggle.click();
  await expect.poll(soundState).toEqual({ muted: true, stored: "1" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect.poll(soundState).toEqual({ muted: false, stored: "0" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await page.reload();
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await expect.poll(soundState).toEqual({ muted: true, stored: "1" });
  await expect(page.locator("#sound-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("game events play their sound effects", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    window.__playedSounds = [];
    window.addEventListener("load", () => {
      const proto = window.Phaser.Sound.BaseSoundManager.prototype;
      const play = proto.play;
      proto.play = function (key, ...args) {
        window.__playedSounds.push(key);
        return play.call(this, key, ...args);
      };
    }, { once: true });
  });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    window.__playedSounds.length = 0;
    // Headless browsers may keep audio locked; the effects must still be requested.
    Object.defineProperty(scene.sound, "locked", { configurable: true, value: false });
    scene.antDied(scene.ants.getChildren()[0]);
    scene.destroyFood(scene.foods.getChildren()[0]);
    scene.overGame();
  });

  expect(await page.evaluate(() => window.__playedSounds)).toEqual(["ant-fall", "food-eaten", "game-over"]);
});
test("the orientation is locked only once fullscreen is really active", async ({ page }) => {
  await stubOrientationLock(page);
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await expect.poll(() => page.evaluate(() => window.__orientationLockCalls)).toEqual([
    { type: "landscape-primary", fullscreenActive: true }
  ]);
});

test("a rejected fullscreen request starts the game without an orientation lock", async ({ page }) => {
  await stubOrientationLock(page);
  await stubRejectedFullscreen(page);
  await exposeScenesForTest(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await expect.poll(() => page.evaluate(() => window.__orientationLockCalls)).toEqual([]);
});

test("iPhone Safari prompts for sensor permission and tilts with window.orientation fallback", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 844, height: 390 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });

  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      window.__permissionRequested = false;
      window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
      window.DeviceOrientationEvent.requestPermission = function () {
        window.__permissionRequested = true;
        return Promise.resolve("granted");
      };
      // Simulate iOS Safari without screen.orientation, using window.orientation instead
      Object.defineProperty(window, "orientation", { configurable: true, value: 90 });
      Object.defineProperty(screen, "orientation", { configurable: true, value: undefined });
    });

    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page, "touch");
    await waitForGameScene(page);

    expect(await page.evaluate(() => window.__permissionRequested)).toBe(true);
    expect(pageErrors).toEqual([]);

    const tiltedBoard = page.locator("#tilting-board");
    await expect(tiltedBoard).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 0,
        gamma: 0
      }));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 30,
        gamma: 0
      }));
    });

    await expect.poll(() => readGameState(page)).toMatchObject({
      gravity: { x: 30, y: 0 }
    });
  } finally {
    await context.close();
  }
});

test("touch drag tilts the board when motion sensors are not delivering input", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 844, height: 390 }
  });

  try {
    const page = await context.newPage();
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page, "touch");
    await waitForGameScene(page);

    const canvas = page.locator("#tilting-board");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY);

    await expect.poll(() => readGameState(page)).toMatchObject({
      gravity: { x: 30, y: 0 }
    });

    await page.mouse.up();
    await expect.poll(() => readGameState(page)).toMatchObject({
      gravity: { x: 0, y: 0 }
    });
  } finally {
    await context.close();
  }
});

test("WASD keys tilt the board alongside arrow keys", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const tiltedBoard = page.locator("#tilting-board");
  await expect(tiltedBoard).toBeVisible();

  await page.keyboard.down("d");
  try {
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 30, y: 0 } });
  } finally {
    await page.keyboard.up("d");
  }

  await page.keyboard.down("a");
  try {
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: -30, y: 0 } });
  } finally {
    await page.keyboard.up("a");
  }

  await page.keyboard.down("s");
  try {
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 0, y: 30 } });
  } finally {
    await page.keyboard.up("s");
  }

  await page.keyboard.down("w");
  try {
    await expect.poll(() => readGameState(page)).toMatchObject({ gravity: { x: 0, y: -30 } });
  } finally {
    await page.keyboard.up("w");
  }
});

test("mobile portrait mode displays the rotation prompt overlay", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 }
  });

  try {
    const page = await context.newPage();
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page, "touch");
    await waitForGameScene(page);

    const rotateOverlay = page.locator("#rotate-device-overlay");
    await expect(rotateOverlay).toBeVisible();

    // Rotate to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(rotateOverlay).toBeHidden();
  } finally {
    await context.close();
  }
});

test("food can be dragged for up to 3 seconds, cannot be eaten while dragging, and has a drag cooldown", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // Freeze living bugs so they do not collide with test foods while dragging is evaluated
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.ants.getChildren().forEach((ant) => {
      ant.isAlive = false;
      ant.setVelocityX(0);
      ant.setVelocityY(0);
      ant.disableBody(true, false);
    });
    scene.caterpillars?.getChildren().forEach((caterpillar) => {
      caterpillar.isAlive = false;
      caterpillar.setVelocityX(0);
      caterpillar.setVelocityY(0);
      caterpillar.disableBody(true, false);
    });
    scene.foods.getChildren().forEach((food) => {
      scene.tweens.killTweensOf(food);
      food.isBeingEaten = false;
      food.isDragCooldown = false;
      food.releaseAllCarriers(false);
      food.isBeingDragged = false;
    });
  });

  // 1. Verify manual drag, protection from being eaten, and cooldown after release
  const dragResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const initialPos = { x: food.x, y: food.y };
    const isInteractive = Boolean(food.input && food.input.enabled);
    const isDraggable = Boolean(food.input && food.input.draggable);

    // Emit dragstart
    food.emit("dragstart", scene.input.activePointer);
    const duringDragState = {
      isBeingDragged: food.isBeingDragged,
      isAnyFoodDragging: scene.isAnyFoodDragging(),
      depth: food.depth,
      scale: food.scaleX
    };

    // Attempt to eat the food while dragging via eatFood and beingEat
    const ant = scene.ants.getChildren()[0];
    scene.eatFood(ant, food);
    food.beingEat();
    const tweenCountWhileDragging = scene.tweens.getTweensOf(food).length;
    const isBeingEatenWhileDragging = food.isBeingEaten;

    // Simulate dragging directly over another food piece and stepping physics
    const otherFood = scene.foods.getChildren()[1];
    const otherFoodInitialPos = { x: otherFood.x, y: otherFood.y };
    const targetX = otherFood.x;
    const targetY = otherFood.y;
    food.emit("drag", scene.input.activePointer, targetX, targetY);
    scene.physics.world.step(1 / 60);
    const otherFoodStayedInPlace = otherFood.x === otherFoodInitialPos.x && otherFood.y === otherFoodInitialPos.y;
    const movedPos = { x: food.x, y: food.y, targetX, targetY, bodyX: food.body.x, bodyY: food.body.y, otherFoodStayedInPlace };

    // Ants pick nearest food should ignore the dragged food
    const nearestToAnt = ant.pickNearestFood();
    const targetIsNotDraggedFood = nearestToAnt !== food;

    // Emit dragend: drops the food and starts cooldown
    food.emit("dragend", scene.input.activePointer);
    const afterDragState = {
      isBeingDragged: food.isBeingDragged,
      isDragCooldown: food.isDragCooldown,
      isAnyFoodDragging: scene.isAnyFoodDragging(),
      depth: food.depth,
      scale: food.scaleX,
      alpha: food.alpha,
      finalPos: { x: food.x, y: food.y }
    };

    // Attempting to drag immediately during cooldown must be blocked
    food.emit("dragstart", scene.input.activePointer);
    const blockedDuringCooldown = !food.isBeingDragged;

    // Advance scene clock past the 1.5s cooldown
    scene.time.preUpdate(0, 1600);
    scene.time.update(0, 1600);
    const afterCooldown = {
      isDragCooldown: food.isDragCooldown,
      alpha: food.alpha
    };

    // 2. Verify 3-second maximum hold duration auto-drops the food
    const secondFood = scene.foods.getChildren()[1];
    secondFood.emit("dragstart", scene.input.activePointer);
    const secondStartedDragging = secondFood.isBeingDragged;

    // At 2.5 seconds it is still being dragged
    scene.time.preUpdate(0, 2500);
    scene.time.update(0, 2500);
    const stillDraggingAt2500ms = secondFood.isBeingDragged;

    // Crossing 3 seconds automatically drops it onto the tray and enters cooldown
    scene.time.preUpdate(0, 600);
    scene.time.update(0, 600);
    const posAfterAutoDrop = { x: secondFood.x, y: secondFood.y };
    // Moving the pointer while still held down after auto-drop does not move the food
    secondFood.emit("drag", scene.input.activePointer, posAfterAutoDrop.x + 50, posAfterAutoDrop.y + 50);
    const autoDropState = {
      isBeingDragged: secondFood.isBeingDragged,
      isDragCooldown: secondFood.isDragCooldown,
      depth: secondFood.depth,
      scale: secondFood.scaleX,
       stayedInPlace: secondFood.x === posAfterAutoDrop.x && secondFood.y === posAfterAutoDrop.y
    };

    return {
      isInteractive,
      isDraggable,
      initialPos,
      duringDragState,
      tweenCountWhileDragging,
      isBeingEatenWhileDragging,
      movedPos,
      targetIsNotDraggedFood,
      afterDragState,
      blockedDuringCooldown,
      afterCooldown,
      secondStartedDragging,
      stillDraggingAt2500ms,
      autoDropState,
      foodCount: scene.foodCount
    };
  });

  expect(dragResult.isInteractive).toBe(true);
  expect(dragResult.isDraggable).toBe(true);
  expect(dragResult.duringDragState.isBeingDragged).toBe(true);
  expect(dragResult.duringDragState.isAnyFoodDragging).toBe(true);
  expect(dragResult.duringDragState.depth).toBe(10);
  expect(dragResult.duringDragState.scale).toBeGreaterThan(1.5);
  // Protected from being eaten while dragged
  expect(dragResult.tweenCountWhileDragging).toBe(0);
  expect(dragResult.isBeingEatenWhileDragging).toBe(false);
  expect(dragResult.foodCount).toBe(8);
  expect(dragResult.targetIsNotDraggedFood).toBe(true);
  // Position moved
  expect(dragResult.movedPos.x).toBe(dragResult.movedPos.targetX);
  expect(dragResult.movedPos.y).toBe(dragResult.movedPos.targetY);
  expect(dragResult.movedPos.otherFoodStayedInPlace).toBe(true);
  // After drop, dragging state resets and cooldown starts
  expect(dragResult.afterDragState.isBeingDragged).toBe(false);
  expect(dragResult.afterDragState.isDragCooldown).toBe(true);
  expect(dragResult.afterDragState.isAnyFoodDragging).toBe(false);
  expect(dragResult.afterDragState.depth).toBe(0);
  expect(dragResult.afterDragState.scale).toBe(1.5);
  expect(dragResult.blockedDuringCooldown).toBe(true);
  expect(dragResult.afterCooldown.isDragCooldown).toBe(false);
  expect(dragResult.afterCooldown.alpha).toBe(1);
  // 3-second max drag hold limit auto-drops and enters cooldown
  expect(dragResult.secondStartedDragging).toBe(true);
  expect(dragResult.stillDraggingAt2500ms).toBe(true);
  expect(dragResult.autoDropState.isBeingDragged).toBe(false);
  expect(dragResult.autoDropState.isDragCooldown).toBe(true);
  expect(dragResult.autoDropState.depth).toBe(0);
  expect(dragResult.autoDropState.scale).toBe(1.5);
  expect(dragResult.autoDropState.stayedInPlace).toBe(true);

  // 3. Verify real PC mouse drag-and-drop moves food without tilting the board,
  // even when another food on cooldown is overlapping the same spot
  const canvasBox = await page.locator("#tilting-board").boundingBox();
  expect(canvasBox).toBeTruthy();

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const cooldownFood = scene.foods.getChildren()[1];
    const draggableFood = scene.foods.getChildren()[2];
    cooldownFood.isDragCooldown = true;
    cooldownFood.setPosition(220, 140);
    cooldownFood.body.reset(220, 140);
    draggableFood.setPosition(220, 140);
    draggableFood.body.reset(220, 140);
    draggableFood.isBeingEaten = false;
    draggableFood.isDragCooldown = false;
    scene.foods.getChildren().forEach((f, idx) => {
      if (idx !== 1 && idx !== 2) {
        f.setPosition(50 + idx * 25, 50);
        f.body.reset(50 + idx * 25, 50);
      }
    });
  });

  const startScreenX = canvasBox.x + (220 / 580) * canvasBox.width;
  const startScreenY = canvasBox.y + (140 / 300) * canvasBox.height;
  const endScreenX = canvasBox.x + (340 / 580) * canvasBox.width;
  const endScreenY = canvasBox.y + (190 / 300) * canvasBox.height;

  await page.mouse.move(startScreenX, startScreenY);
  await page.mouse.down();
  await page.mouse.move(endScreenX, endScreenY, { steps: 5 });

  const mouseDragMidState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const draggableFood = scene.foods.getChildren()[2];
    return {
      isBeingDragged: draggableFood.isBeingDragged,
      x: draggableFood.x,
      y: draggableFood.y,
      gravity: { x: scene.gravity.x, y: scene.gravity.y }
    };
  });

  expect(mouseDragMidState.isBeingDragged).toBe(true);
  expect(mouseDragMidState.x).toBeGreaterThan(300);
  expect(mouseDragMidState.y).toBeGreaterThan(170);
  expect(mouseDragMidState.gravity).toEqual({ x: 0, y: 0 });

  await page.mouse.up();

  const mouseDragEndState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const draggableFood = scene.foods.getChildren()[2];
    return {
      isBeingDragged: draggableFood.isBeingDragged,
      isDragCooldown: draggableFood.isDragCooldown
    };
  });

  expect(mouseDragEndState.isBeingDragged).toBe(false);
  expect(mouseDragEndState.isDragCooldown).toBe(true);

  // 4. Verify food cannot be placed on top of other food
  const overlapDropResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const foodA = scene.foods.getChildren()[0];
    const foodB = scene.foods.getChildren()[1];
    foodA.setPosition(150, 150);
    foodA.body.reset(150, 150);
    foodA.dragOriginX = 150;
    foodA.dragOriginY = 150;
    foodA.isBeingEaten = false;
    foodA.isDragCooldown = false;
    foodB.setPosition(250, 150);
    foodB.body.reset(250, 150);
    foodB.dragOriginX = 250;
    foodB.dragOriginY = 250;
    foodB.isBeingEaten = false;
    foodB.isDragCooldown = false;

    // Drag foodA right onto foodB
    foodA.emit("dragstart", scene.input.activePointer);
    foodA.emit("drag", scene.input.activePointer, 250, 150);
    const duringPos = { x: foodA.x, y: foodA.y };

    // Drop foodA on foodB: rejected and reverted to origin
    foodA.emit("dragend", scene.input.activePointer);

    const afterPos = { x: foodA.x, y: foodA.y };
    return { duringPos, afterPos };
  });

  expect(overlapDropResult.duringPos).toEqual({ x: 250, y: 150 });
  expect(overlapDropResult.afterPos).toEqual({ x: 150, y: 150 });
});

test("Vite dev server supports PC mouse food dragging and window release", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto(DEVELOPMENT_URL);
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const canvasBox = await page.locator("#tilting-board").boundingBox();
  expect(canvasBox).toBeTruthy();

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.ants.getChildren().forEach((ant) => ant.disableBody(true, false));
    scene.caterpillars?.getChildren().forEach((caterpillar) => caterpillar.disableBody(true, false));
    scene.foods.getChildren().forEach((f, idx) => {
      scene.tweens.killTweensOf(f);
      f.isBeingEaten = false;
      f.isDragCooldown = false;
      f.releaseAllCarriers(false);
      f.isBeingDragged = false;
      if (idx > 0) {
        f.setPosition(50 + idx * 25, 50);
        f.body.reset(50 + idx * 25, 50);
      }
    });
    const food = scene.foods.getChildren()[0];
    food.setPosition(250, 150);
    food.body.reset(250, 150);
    food.isBeingEaten = false;
    food.isDragCooldown = false;
  });

  const startScreenX = canvasBox.x + (250 / 580) * canvasBox.width;
  const startScreenY = canvasBox.y + (150 / 300) * canvasBox.height;
  const moveScreenX = canvasBox.x + (350 / 580) * canvasBox.width;
  const moveScreenY = canvasBox.y + (180 / 300) * canvasBox.height;

  await page.mouse.move(startScreenX, startScreenY);
  await page.mouse.down();
  await page.mouse.move(moveScreenX, moveScreenY, { steps: 5 });

  const midState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    return {
      isBeingDragged: food.isBeingDragged,
      x: food.x,
      y: food.y
    };
  });
  expect(midState.isBeingDragged).toBe(true);
  expect(midState.x).toBeGreaterThan(300);

  await page.mouse.move(10, 10);
  await page.mouse.up();

  const endState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    return {
      isBeingDragged: food.isBeingDragged,
      isDragCooldown: food.isDragCooldown
    };
  });
  expect(endState.isBeingDragged).toBe(false);
  expect(endState.isDragCooldown).toBe(true);
});

test("caterpillar spawns, resists tilt with lower gravityFactor, and awards 2 points on escape", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const caterpillarData = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const caterpillar = scene.caterpillars.getChildren()[0];
    return {
      caterpillarCount: scene.caterpillars.getChildren().length,
      speed: caterpillar.CATERPILLAR_SPEED,
      gravityFactor: caterpillar.gravityFactor,
      isAlive: caterpillar.isAlive,
      textureKey: caterpillar.texture.key
    };
  });

  expect(caterpillarData.caterpillarCount).toBe(1);
  expect(caterpillarData.speed).toBe(24);
  expect(caterpillarData.gravityFactor).toBe(3.5);
  expect(caterpillarData.isAlive).toBe(true);
  expect(caterpillarData.textureKey).toBe("caterpillar");

  // Trigger worm escape and verify 2 points are awarded
  const escapeScore = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const caterpillar = scene.caterpillars.getChildren()[0];
    const scoreBefore = scene.score;
    scene.wormDied(caterpillar);
    return { scoreBefore, scoreAfter: scene.score };
  });

  expect(escapeScore.scoreAfter).toBe(escapeScore.scoreBefore + 2);
});

test("ants steal food cooperatively and carry it faster towards edges", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // 1. First ant steals food upon collision
  const firstStealResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    ant1.isAlive = true;
    ant1.isClimbing = false;
    ant2.isAlive = true;
    ant2.isClimbing = false;
    food.isBeingEaten = false;
    food.releaseAllCarriers(false);
    food.isBeingDragged = false;

    // Freeze other bugs
    scene.ants.getChildren().slice(2).forEach((a) => a.disableBody(true, false));
    scene.caterpillars?.getChildren().forEach((c) => c.disableBody(true, false));

    // Ant 1 hits food
    scene.antHitFood(ant1, food);

    return {
      ant1CarryingFood: ant1.carriedFood === food,
      carrierCountAfterOne: food.carrierCount,
      isBeingCarried: food.isBeingCarried,
      carrierAnt: food.carrierAnt === ant1
    };
  });

  expect(firstStealResult.ant1CarryingFood).toBe(true);
  expect(firstStealResult.carrierCountAfterOne).toBe(1);
  expect(firstStealResult.isBeingCarried).toBe(true);
  expect(firstStealResult.carrierAnt).toBe(true);

  // 2. Second ant joins stealing the same food piece
  const secondStealResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    // Ant 2 hits the same food
    scene.antHitFood(ant2, food);

    return {
      ant2CarryingFood: ant2.carriedFood === food,
      carrierCountAfterTwo: food.carrierCount
    };
  });

  expect(secondStealResult.ant2CarryingFood).toBe(true);
  expect(secondStealResult.carrierCountAfterTwo).toBe(2);

  // 3. Dragging food with ants maintains carrier ants attached without dropping the food
  const dragWithCarriersResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    // Player drags the food
    food.startDrag();

    return {
      ant1CarryingFood: ant1.carriedFood === food,
      ant2CarryingFood: ant2.carriedFood === food,
      carrierCountAfterDrag: food.carrierCount,
      isBeingCarried: food.isBeingCarried,
      isBeingDragged: food.isBeingDragged
    };
  });

  expect(dragWithCarriersResult.ant1CarryingFood).toBe(true);
  expect(dragWithCarriersResult.ant2CarryingFood).toBe(true);
  expect(dragWithCarriersResult.carrierCountAfterDrag).toBe(2);
  expect(dragWithCarriersResult.isBeingCarried).toBe(true);
  expect(dragWithCarriersResult.isBeingDragged).toBe(true);

  // 4. Moving the food moves the attached ants along with it
  const moveResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    food.moveDrag(220, 160);

    return {
      foodX: food.x,
      foodY: food.y,
      dist1: Math.hypot(ant1.x - food.x, ant1.y - food.y),
      dist2: Math.hypot(ant2.x - food.x, ant2.y - food.y)
    };
  });

  expect(moveResult.foodX).toBe(220);
  expect(moveResult.foodY).toBe(160);
  expect(moveResult.dist1).toBeLessThan(40);
  expect(moveResult.dist2).toBeLessThan(40);

  // 5. Dropping the food keeps the ants attached so they continue stealing from the new spot
  const dropResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    food.finishDrag();

    return {
      ant1CarryingFood: ant1.carriedFood === food,
      ant2CarryingFood: ant2.carriedFood === food,
      carrierCountAfterDrop: food.carrierCount,
      isBeingCarried: food.isBeingCarried,
      isBeingDragged: food.isBeingDragged
    };
  });

  expect(dropResult.ant1CarryingFood).toBe(true);
  expect(dropResult.ant2CarryingFood).toBe(true);
  expect(dropResult.carrierCountAfterDrop).toBe(2);
  expect(dropResult.isBeingCarried).toBe(true);
  expect(dropResult.isBeingDragged).toBe(false);

  // 6. Picking up the food and shaking it causes the ants to fall in random positions
  const shakeResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];
    const food = scene.foods.getChildren()[0];

    // Clear cooldown for test purposes
    food.isDragCooldown = false;
    food.startDrag();

    const ant1PosBefore = { x: ant1.x, y: ant1.y };
    const ant2PosBefore = { x: ant2.x, y: ant2.y };

    // Rapid shaking back and forth (4 alternating moves to guarantee >= 2 reversals)
    const t = scene.time.now;
    food.moveDrag(180, 160, t + 40);
    food.moveDrag(250, 160, t + 80);
    food.moveDrag(180, 160, t + 120);
    food.moveDrag(250, 160, t + 160);

    const bounds = scene.tray.getBounds();
    const ant1InsideTray = ant1.x >= bounds.x && ant1.x <= bounds.x + bounds.width &&
                          ant1.y >= bounds.y && ant1.y <= bounds.y + bounds.height;
    const ant2InsideTray = ant2.x >= bounds.x && ant2.x <= bounds.x + bounds.width &&
                          ant2.y >= bounds.y && ant2.y <= bounds.y + bounds.height;

    return {
      carrierCountAfterShake: food.carrierCount,
      isBeingCarriedAfterShake: food.isBeingCarried,
      ant1CarryingFood: ant1.carriedFood !== null,
      ant2CarryingFood: ant2.carriedFood !== null,
      ant1InsideTray,
      ant2InsideTray,
      ant1Moved: ant1.x !== ant1PosBefore.x || ant1.y !== ant1PosBefore.y,
      ant2Moved: ant2.x !== ant2PosBefore.x || ant2.y !== ant2PosBefore.y
    };
  });

  expect(shakeResult.carrierCountAfterShake).toBe(0);
  expect(shakeResult.isBeingCarriedAfterShake).toBe(false);
  expect(shakeResult.ant1CarryingFood).toBe(false);
  expect(shakeResult.ant2CarryingFood).toBe(false);
  expect(shakeResult.ant1InsideTray).toBe(true);
  expect(shakeResult.ant2InsideTray).toBe(true);
});
