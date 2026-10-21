const { expect, test } = require("@playwright/test");

const DEVELOPMENT_URL = `http://127.0.0.1:${process.env.PLAYWRIGHT_DEV_PORT || 4174}/dev.html`;

const REQUIRED_ASSETS = [
  "/assets/images/grass.png",
  "/assets/images/trayWithCompleteClothe.png",
  "/assets/images/food.png",
  "/assets/images/ant_sheet.png"
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

  await stubFullscreen(page);
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

  const tweenCount = await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.score = 4;
    gameScene.scoreText.setText("4");
    const targetFood = gameScene.foods.getChildren()[0];
    gameScene.eatFood(gameScene.ants.getChildren()[0], targetFood);
    gameScene.eatFood(gameScene.ants.getChildren()[0], targetFood);
    return gameScene.tweens.getTweensOf(targetFood).length;
  });
  expect(tweenCount).toBe(1);

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

test("non-Chrome browsers stay on the title screen with an unsupported message", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
  });

  try {
    const page = await context.newPage();
    await stubFullscreenAndExposeScenes(page);
    await page.goto("/");
    await clickStartOnCanvas(page);

    await expect.poll(() => page.evaluate(() => ({
      titleText: window.__titleSceneForTest.startTxt.text,
      gameSceneStarted: Boolean(window.__gameSceneForTest)
    }))).toEqual({
      titleText: "Browser not supported\nplease use Chrome",
      gameSceneStarted: false
    });
    await expect(page.locator("#tilting-board")).toHaveCount(0);
  } finally {
    await context.close();
  }
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
