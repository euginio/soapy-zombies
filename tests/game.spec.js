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

test("PWA manifest, service worker, icons, and installability tags are configured", async ({ page }) => {
  await page.goto("/");

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveCount(1);
  const manifestHref = await manifestLink.getAttribute("href");
  expect(manifestHref).toContain("manifest.webmanifest");

  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#172312");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "assets/images/icon-192.png");

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Ants Feast");
  expect(manifest.short_name).toBe("Ants Feast");
  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("landscape");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  const icon192 = await page.request.get("/assets/images/icon-192.png");
  expect(icon192.status()).toBe(200);
  const icon512 = await page.request.get("/assets/images/icon-512.png");
  expect(icon512.status()).toBe(200);

  const swResponse = await page.request.get("/sw.js");
  expect(swResponse.status()).toBe(200);

  const swRegistered = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    return Boolean(registration);
  });
  expect(swRegistered).toBe(true);
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
    visibleAnts: 0,
    visibleFoods: 1,
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

  await page.evaluate(() => window.__gameSceneForTest.startLevel(4, false));

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
    await page.evaluate(() => window.__gameSceneForTest.startLevel(3, false));
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
  await page.evaluate(() => window.__gameSceneForTest.startLevel(4, false));

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
    foodCount: 1,
    availableFood: 1,
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
    foodCount: 1,
    foodSprites: 1,
    availableFood: 1,
    antSprites: 0
  });
});

test("an ant that leaves the tray awards a point through the fall path", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=4");
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
  await page.goto("/?level=4");
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

  await page.goto("/?level=4");
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
  await page.evaluate(() => window.__gameSceneForTest.startLevel(3, false));

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
  await page.goto("/?level=4");
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
    await page.evaluate(() => window.__gameSceneForTest.startLevel(3, false));

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
    await page.evaluate(() => window.__gameSceneForTest.startLevel(3, false));

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
  await page.evaluate(() => window.__gameSceneForTest.startLevel(3, false));

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
  await page.goto("/?level=4");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

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

    // Drop foodA on foodB: placed next to foodB instead of reverting to origin
    foodA.emit("dragend", scene.input.activePointer);

    const afterPos = { x: foodA.x, y: foodA.y };
    const distToFoodB = Math.hypot(afterPos.x - 250, afterPos.y - 150);
    return { duringPos, afterPos, distToFoodB };
  });

  expect(overlapDropResult.duringPos).toEqual({ x: 250, y: 150 });
  expect(overlapDropResult.afterPos).not.toEqual({ x: 150, y: 150 });
  expect(overlapDropResult.distToFoodB).toBeGreaterThanOrEqual(32);
  expect(overlapDropResult.distToFoodB).toBeLessThanOrEqual(45);
});

test("Vite dev server supports PC mouse food dragging and window release", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto(DEVELOPMENT_URL);
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

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
  await page.evaluate(() => window.__gameSceneForTest.startLevel(2, false));

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
  await page.goto("/?level=4");
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

  // 7. Carrying food out of the tray causes the food to be stolen and destroyed
  const initialFoodCount = await page.evaluate(() => window.__gameSceneForTest.foodCount);
  const stealExitResult = await page.evaluate(async () => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const ant1 = scene.ants.getChildren()[0];
    const ant2 = scene.ants.getChildren()[1];

    food.isBeingDragged = false;
    food.isBeingEaten = false;
    food.isDragCooldown = false;
    food.addCarrier(ant1);
    food.addCarrier(ant2);
    ant1.carriedFood = food;
    ant2.carriedFood = food;

    const trayBounds = scene.tray.getBounds();
    // Position food at the outer edge so carriers step off on update
    food.setPosition(trayBounds.x - 10, 160);
    food.body.reset(food.x, food.y);

    food.update(scene.time.now, 300);

    return {
      foodCountAfterSteal: scene.foodCount,
      foodActive: food.active,
      foodBodyEnabled: Boolean(food.body?.enable),
      ant1Carrying: ant1.carriedFood !== null,
      ant2Carrying: ant2.carriedFood !== null
    };
  });

  expect(stealExitResult.foodCountAfterSteal).toBe(initialFoodCount - 1);
  expect(stealExitResult.foodActive).toBe(false);
  expect(stealExitResult.ant1Carrying).toBe(false);
  expect(stealExitResult.ant2Carrying).toBe(false);
});

test("tray tilt does not affect ants carrying food", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.evaluate(() => window.__gameSceneForTest.startLevel(4, false));

  const tiltImmunityResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const carrierAnt = scene.ants.getChildren()[0];
    const freeAnt = scene.ants.getChildren()[1];

    // Position food and carrier ant at center
    carrierAnt.isAlive = true;
    carrierAnt.isClimbing = false;
    freeAnt.isAlive = true;
    freeAnt.isClimbing = false;

    food.isBeingEaten = false;
    food.isBeingDragged = false;
    food.setPosition(250, 150);
    food.body.reset(250, 150);
    food.releaseAllCarriers(false);

    carrierAnt.setPosition(250, 150);
    carrierAnt.body.reset(250, 150);
    scene.antHitFood(carrierAnt, food);

    // Apply strong rightward/downward tilt
    scene.gravity.x = 30;
    scene.gravity.y = 30;

    // Call setVelocity on both ants
    carrierAnt.setVelocity(0, 0);
    freeAnt.setVelocity(0, 0);

    const carrierVx = carrierAnt.body.velocity.x;
    const carrierVy = carrierAnt.body.velocity.y;
    const freeVx = freeAnt.body.velocity.x;
    const freeVy = freeAnt.body.velocity.y;

    // Simulate food update with tilted scene gravity
    const foodXBefore = food.x;
    const foodYBefore = food.y;
    food.update(0, 100);
    const deltaXWithTilt = food.x - foodXBefore;
    const deltaYWithTilt = food.y - foodYBefore;

    // Reset position and simulate food update with zero tilt
    food.setPosition(250, 150);
    food.body.reset(250, 150);
    scene.gravity.x = 0;
    scene.gravity.y = 0;
    food.update(0, 100);
    const deltaXWithoutTilt = food.x - 250;
    const deltaYWithoutTilt = food.y - 150;

    return {
      antCarryingFood: carrierAnt.carriedFood === food,
      carrierVx,
      carrierVy,
      freeVx,
      freeVy,
      deltaXWithTilt,
      deltaYWithTilt,
      deltaXWithoutTilt,
      deltaYWithoutTilt
    };
  });

  expect(tiltImmunityResult.antCarryingFood).toBe(true);
  // Free ant has gravity applied (30 * 10 = 300)
  expect(tiltImmunityResult.freeVx).toBe(300);
  expect(tiltImmunityResult.freeVy).toBe(300);
  // Carrier ant has 0 gravity velocity
  expect(tiltImmunityResult.carrierVx).toBe(0);
  expect(tiltImmunityResult.carrierVy).toBe(0);
  // Food steal progression is identical with or without tilt
  expect(tiltImmunityResult.deltaXWithTilt).toBeCloseTo(tiltImmunityResult.deltaXWithoutTilt, 4);
  expect(tiltImmunityResult.deltaYWithTilt).toBeCloseTo(tiltImmunityResult.deltaYWithoutTilt, 4);
});

test("fullscreen toggle and recovery prompt restore fullscreen when exited", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const fullscreenBtn = page.locator("#fullscreen-toggle");
  await expect(fullscreenBtn).toHaveCount(1);
  await expect(fullscreenBtn).toBeVisible();

  // Fullscreen prompt overlay exists
  const promptOverlay = page.locator("#fullscreen-prompt-overlay");
  await expect(promptOverlay).toHaveCount(1);

  // Triggering fullscreen loss shows the prompt overlay
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.showFullscreenPrompt();
  });
  await expect(promptOverlay).toBeVisible();

  // Clicking the prompt overlay restores fullscreen and hides the prompt
  await promptOverlay.click();
  await expect(promptOverlay).toBeHidden();
});

test("screen wake lock is acquired during gameplay and released on shutdown", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wakeLockRequests = [];
    window.__wakeLockReleased = 0;
    const mockSentinel = {
      released: false,
      type: "screen",
      listeners: new Set(),
      async release() {
        this.released = true;
        window.__wakeLockReleased++;
        for (const l of this.listeners) l();
      },
      addEventListener(type, l) {
        if (type === "release") this.listeners.add(l);
      },
      removeEventListener(type, l) {
        if (type === "release") this.listeners.delete(l);
      }
    };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      writable: true,
      value: {
        async request(type) {
          window.__wakeLockRequests.push(type);
          mockSentinel.released = false;
          return mockSentinel;
        }
      }
    });
  });

  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await expect.poll(() => page.evaluate(() => window.__wakeLockRequests?.length)).toBeGreaterThanOrEqual(1);
  const requests = await page.evaluate(() => window.__wakeLockRequests);
  expect(requests).toContain("screen");

  await page.evaluate(() => {
    window.__gameSceneForTest.scene.start("TitleScene");
  });
  await expect.poll(() => page.evaluate(() => window.__wakeLockReleased)).toBeGreaterThanOrEqual(1);
});

test("dropping food over another food places it next to it instead of reverting to origin", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=4");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const dropResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const foods = scene.foods.getChildren();
    const food1 = foods[0];
    const food2 = foods[1];

    food2.setPosition(250, 150);
    food2.body.reset(250, 150);

    food1.setPosition(100, 100);
    food1.body.reset(100, 100);
    food1.emit("dragstart", scene.input.activePointer);

    const origin = { x: food1.dragOriginX, y: food1.dragOriginY };

    food1.emit("drag", scene.input.activePointer, 255, 150);
    food1.emit("dragend", scene.input.activePointer);

    const finalPos = { x: food1.x, y: food1.y };
    const dx = finalPos.x - food2.x;
    const dy = finalPos.y - food2.y;
    const distanceToFood2 = Math.hypot(dx, dy);

    return {
      origin,
      finalPos,
      food2Pos: { x: food2.x, y: food2.y },
      distanceToFood2,
      revertedToOrigin: finalPos.x === origin.x && finalPos.y === origin.y,
      overlapsFood2: distanceToFood2 < 32
    };
  });

  expect(dropResult.revertedToOrigin).toBe(false);
  expect(dropResult.overlapsFood2).toBe(false);
  expect(dropResult.distanceToFood2).toBeGreaterThanOrEqual(32);
  expect(dropResult.distanceToFood2).toBeLessThanOrEqual(45);
});

test("caterpillar eating pauses and stops when the worm is no longer touching the food", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.evaluate(() => window.__gameSceneForTest.startLevel(5, false));

  const startEatingResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const caterpillar = scene.caterpillars.getChildren()[0];
    const food = scene.foods.getChildren()[0];

    scene.ants?.getChildren().forEach((ant) => ant.disableBody(true, false));

    food.setPosition(200, 150);
    food.body.reset(200, 150);
    caterpillar.setPosition(200, 150);
    caterpillar.body.reset(200, 150);
    caterpillar.isClimbing = false;
    caterpillar.isAlive = true;

    scene.eatFood(caterpillar, food);

    return {
      isBeingEaten: food.isBeingEaten,
      isWormEating: food.isWormEating,
      hasTween: Boolean(food.eatTween && !food.eatTween.isDestroyed()),
      isTweenPlaying: Boolean(food.eatTween && food.eatTween.isPlaying() && !food.eatTween.isPaused())
    };
  });

  expect(startEatingResult.isBeingEaten).toBe(true);
  expect(startEatingResult.isWormEating).toBe(true);
  expect(startEatingResult.hasTween).toBe(true);
  expect(startEatingResult.isTweenPlaying).toBe(true);

  const separatedResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const caterpillar = scene.caterpillars.getChildren()[0];
    const food = scene.foods.getChildren()[0];

    caterpillar.setPosition(350, 150);
    caterpillar.body.reset(350, 150);

    food.update(0, 16);

    const progressWhenSeparated = food.eatProgress;

    return {
      isBeingEaten: food.isBeingEaten,
      isPaused: Boolean(food.eatTween && food.eatTween.isPaused()),
      scale: food.scaleX,
      angle: food.angle,
      progressWhenSeparated,
      foodActive: food.active
    };
  });

  expect(separatedResult.isBeingEaten).toBe(false);
  expect(separatedResult.isPaused).toBe(true);
  expect(separatedResult.scale).toBe(1.5);
  expect(separatedResult.angle).toBe(0);
  expect(separatedResult.foodActive).toBe(true);

  const elapsedResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];

    for (let i = 0; i < 20; i++) {
      food.update(0, 16);
    }

    return {
      isBeingEaten: food.isBeingEaten,
      isPaused: Boolean(food.eatTween && food.eatTween.isPaused()),
      eatProgress: food.eatProgress,
      foodActive: food.active
    };
  });

  expect(elapsedResult.isBeingEaten).toBe(false);
  expect(elapsedResult.isPaused).toBe(true);
  expect(elapsedResult.eatProgress).toBe(separatedResult.progressWhenSeparated);
  expect(elapsedResult.foodActive).toBe(true);

  const resumeResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const caterpillar = scene.caterpillars.getChildren()[0];
    const food = scene.foods.getChildren()[0];

    caterpillar.setPosition(200, 150);
    caterpillar.body.reset(200, 150);

    food.update(0, 16);

    return {
      isBeingEaten: food.isBeingEaten,
      isPaused: Boolean(food.eatTween && food.eatTween.isPaused()),
      isTweenPlaying: Boolean(food.eatTween && food.eatTween.isPlaying() && !food.eatTween.isPaused())
    };
  });

  expect(resumeResult.isBeingEaten).toBe(true);
  expect(resumeResult.isPaused).toBe(false);
  expect(resumeResult.isTweenPlaying).toBe(true);
});
test("level progression moves through tutorial levels, gates tilt/drag controls, and transitions seamlessly", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // 1. Level 1 (Tutorial 1): Starts at Tutorial 1 with drag enabled, tilt disabled, and HUD displays tutorial info
  const initialLevelState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const hud = document.querySelector("#level-hud");
    const banner = document.querySelector("#level-banner");
    const bannerTitle = document.querySelector("#level-banner-title");
    return {
      currentLevel: scene.currentLevel,
      isTutorialMode: scene.isTutorialMode,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      goalType: scene.currentLevelConfig.goalType,
      goalTarget: scene.currentLevelConfig.goalTarget,
      antsCount: scene.ants.getChildren().length,
      hudText: hud?.textContent ?? "",
      bannerVisible: banner?.style.display !== "none",
      bannerTitle: bannerTitle?.textContent ?? ""
    };
  });

  expect(initialLevelState.currentLevel).toBe(1);
  expect(initialLevelState.isTutorialMode).toBe(true);
  expect(initialLevelState.isTiltEnabled).toBe(false);
  expect(initialLevelState.isDragEnabled).toBe(true);
  expect(initialLevelState.goalType).toBe("move_food");
  expect(initialLevelState.goalTarget).toBe(1);
  expect(initialLevelState.antsCount).toBe(0);
  expect(initialLevelState.hudText).toContain("TUTORIAL 1");
  expect(initialLevelState.hudText).toContain("MUEVE LA COMIDA: 0/1");
  expect(initialLevelState.bannerTitle).toBe("Tutorial 1");

  // Click confirmation button to start Tutorial 1 gameplay
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isLevelIntroActive)).toBe(false);

  // 2. In Tutorial 1, tray tilt controls do NOT tilt the board
  await page.keyboard.down("ArrowRight");
  const tiltTransform = await page.locator("#tilting-board").evaluate((el) => el.style.transform);
  expect(tiltTransform).toBe("perspective(900px) rotateX(0deg) rotateY(0deg)");
  await page.keyboard.up("ArrowRight");

  // 3. Moving the food completes Tutorial 1
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.startDrag();
    food.moveDrag(food.x + 50, food.y + 50);
    food.finishDrag();
  });

  const levelCompleteOverlay = page.locator("#level-complete-overlay");
  await expect(levelCompleteOverlay).toBeVisible();

  const completeContent = await page.evaluate(() => {
    return {
      title: document.querySelector("#level-complete-title")?.textContent,
      subtitle: document.querySelector("#level-complete-subtitle")?.textContent,
      instruction: document.querySelector("#level-complete-instruction")?.textContent,
      hasContinueBtn: Boolean(document.querySelector("#level-complete-continue"))
    };
  });
  expect(completeContent.title).toContain("Tutorial 1");
  expect(completeContent.subtitle).toContain("Tutorial 2");
  expect(completeContent.hasContinueBtn).toBe(true);

  // Level does NOT advance automatically while waiting for user
  expect(await page.evaluate(() => window.__gameSceneForTest.currentLevel)).toBe(1);

  // Click continue button to advance to Tutorial 2
  await page.locator("#level-complete-continue").click();
  await expect(levelCompleteOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.currentLevel)).toBe(2);
  expect(await page.evaluate(() => window.__gameSceneForTest.isTutorialMode)).toBe(true);

  // Before starting Tutorial 2, the confirmation modal is shown with Tutorial 2 rules!
  await expect(page.locator("#level-banner")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Tutorial 2");
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isLevelIntroActive)).toBe(false);

  // 5. Tutorial 2 has shake_ants goal, 1 food carried by 1 stationary ant, and tilt disabled
  const level2State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const ant = scene.ants.getChildren()[0];
    return {
      currentLevel: scene.currentLevel,
      isTutorialMode: scene.isTutorialMode,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      goalType: scene.currentLevelConfig.goalType,
      foodCount: scene.foodCount,
      antCount: scene.ants.getChildren().length,
      isBeingCarried: food.isBeingCarried,
      antCarrying: Boolean(ant.carriedFood),
      antSpeed: scene.currentLevelConfig.antSpeed,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(level2State.currentLevel).toBe(2);
  expect(level2State.isTutorialMode).toBe(true);
  expect(level2State.isTiltEnabled).toBe(false);
  expect(level2State.isDragEnabled).toBe(true);
  expect(level2State.goalType).toBe("shake_ants");
  expect(level2State.foodCount).toBe(1);
  expect(level2State.antCount).toBe(1);
  expect(level2State.isBeingCarried).toBe(true);
  expect(level2State.antCarrying).toBe(true);
  expect(level2State.antSpeed).toBe(0);
  expect(level2State.hudText).toContain("TUTORIAL 2");
  expect(level2State.hudText).toContain("SACUDE LA COMIDA: 0/1");

  // Shaking the food vigorously shakes off the ant and completes Tutorial 2
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.clearDragTimers();
    food.isDragCooldown = false;
    const t0 = performance.now();
    food.startDrag(undefined, t0);
    food.moveDrag(food.x - 25, food.y, t0 + 40);
    food.moveDrag(food.x + 30, food.y, t0 + 80);
    food.moveDrag(food.x - 25, food.y, t0 + 120);
    food.finishDrag();
  });

  await expect(levelCompleteOverlay).toBeVisible();
  const lvl2CompleteTitle = await page.locator("#level-complete-title").textContent();
  expect(lvl2CompleteTitle).toContain("Tutorial 2");

  // Continue to Tutorial 3
  await page.locator("#level-complete-continue").click();
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Tutorial 3");
  await page.locator("#level-banner-confirm").click();

  // 6. Tutorial 3 has food drag disabled, tray tilt enabled, 0 food, and 1 ant in center
  const level3State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      isTutorialMode: scene.isTutorialMode,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      foodsCount: scene.foods.getChildren().length,
      antsCount: scene.ants.getChildren().length,
      goalType: scene.currentLevelConfig.goalType,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(level3State.currentLevel).toBe(3);
  expect(level3State.isTutorialMode).toBe(true);
  expect(level3State.isTiltEnabled).toBe(true);
  expect(level3State.isDragEnabled).toBe(false);
  expect(level3State.foodsCount).toBe(0);
  expect(level3State.antsCount).toBe(1);
  expect(level3State.goalType).toBe("defeat_ants");
  expect(level3State.hudText).toContain("TUTORIAL 3");
  expect(level3State.hudText).toContain("NIVELA LA BANDEJA");
  await expect.poll(() => page.locator("#level-hud").textContent()).toContain("HORMIGAS: 0/1");

  // Arrow key tilts the board in Tutorial 3
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(() => page.locator("#tilting-board").evaluate((el) => el.style.transform))
    .toBe("perspective(900px) rotateX(0deg) rotateY(10deg)");
  await page.keyboard.up("ArrowRight");

  // Trigger ant defeat to complete Tutorial 3
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    scene.antDied(ant);
  });

  await expect(levelCompleteOverlay).toBeVisible();
  expect(await page.locator("#level-complete-title").textContent()).toContain("¡Tutorial completado!");
  expect(await page.locator("#level-complete-subtitle").textContent()).toContain("Nivel 1");
  expect(await page.evaluate(() => localStorage.getItem("tutorialCompleted"))).toBe("true");

  // Continue to Game Level 1
  await page.locator("#level-complete-continue").click();
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Nivel 1");
  await expect(page.locator("#level-banner-subtitle")).toHaveText("¡Defensa total!");
  await page.locator("#level-banner-confirm").click();

  // 7. Game Level 1 has full combined controls and final wave
  const level1State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      isTutorialMode: scene.isTutorialMode,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      caterpillarsEnabled: scene.currentLevelConfig.caterpillarsEnabled,
      goalTarget: scene.currentLevelConfig.goalTarget
    };
  });
  expect(level1State.currentLevel).toBe(1);
  expect(level1State.isTutorialMode).toBe(false);
  expect(level1State.isTiltEnabled).toBe(true);
  expect(level1State.isDragEnabled).toBe(true);
  expect(level1State.caterpillarsEnabled).toBe(false);
  expect(level1State.goalTarget).toBe(20);

  // In Level 1 (goalTarget 20), reaching 70% (14 of 20 ants) triggers the final wave of ants
  const waveStateBefore = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    // Defeat 13 ants (progress 13/20 = 65%, below 70%)
    for (let i = 0; i < 13; i++) {
      scene.antDied(scene.ants.getChildren()[0]);
    }
    return {
      progress: scene.levelProgress,
      hasTriggeredFinalWave: scene.hasTriggeredFinalWave,
      antsCount: scene.ants.getChildren().length
    };
  });
  expect(waveStateBefore.progress).toBe(13);
  expect(waveStateBefore.hasTriggeredFinalWave).toBe(false);

  // Defeat 14th ant (14/20 = 70% >= 70% threshold): triggers final wave!
  const waveStateAfter = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.antDied(scene.ants.getChildren()[0]);
    return {
      progress: scene.levelProgress,
      hasTriggeredFinalWave: scene.hasTriggeredFinalWave,
      antsCount: scene.ants.getChildren().length,
      bannerText: document.querySelector("#level-banner-title")?.textContent ?? ""
    };
  });
  expect(waveStateAfter.progress).toBe(14);
  expect(waveStateAfter.hasTriggeredFinalWave).toBe(true);
  expect(waveStateAfter.bannerText).toContain("¡OLEADA FINAL!");

  // 8. Game Level 2 introduces caterpillars and defeat_ants goal of 25 ants
  await page.evaluate(() => window.__gameSceneForTest.startLevel(2, false));
  const level2GameState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      caterpillarsEnabled: scene.currentLevelConfig.caterpillarsEnabled,
      caterpillarsCount: scene.caterpillars.getChildren().length,
      goalType: scene.currentLevelConfig.goalType,
      goalTarget: scene.currentLevelConfig.goalTarget,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(level2GameState.isTiltEnabled).toBe(true);
  expect(level2GameState.isDragEnabled).toBe(true);
  expect(level2GameState.caterpillarsEnabled).toBe(true);
  expect(level2GameState.caterpillarsCount).toBeGreaterThanOrEqual(1);
  expect(level2GameState.goalType).toBe("defeat_ants");
  expect(level2GameState.goalTarget).toBe(25);
  expect(level2GameState.hudText).toContain("HORMIGAS: 0/25");

  // Ant falling from tray increments defeat_ants progress in Level 2
  const antProgress = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    scene.antDied(ant);
    return {
      levelProgress: scene.levelProgress,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(antProgress.levelProgress).toBe(1);
  expect(antProgress.hudText).toContain("HORMIGAS: 1/25");

  // 9. Level 5 has 2 caterpillars and 40 ant target
  await page.evaluate(() => window.__gameSceneForTest.startLevel(5, false));
  const level5State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      caterpillarsCount: scene.caterpillars.getChildren().length,
      goalTarget: scene.currentLevelConfig.goalTarget,
      antSpeed: scene.currentLevelConfig.antSpeed
    };
  });
  expect(level5State.currentLevel).toBe(5);
  expect(level5State.caterpillarsCount).toBe(2);
  expect(level5State.goalTarget).toBe(40);
  expect(level5State.antSpeed).toBe(74);

  // 10. Level 7 has 8 ants, 2 caterpillars, and 50 ant target
  await page.evaluate(() => window.__gameSceneForTest.startLevel(7, false));
  const level7State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      antsCount: scene.ants.getChildren().length,
      caterpillarsCount: scene.caterpillars.getChildren().length,
      goalTarget: scene.currentLevelConfig.goalTarget,
      antSpeed: scene.currentLevelConfig.antSpeed
    };
  });
  expect(level7State.currentLevel).toBe(7);
  expect(level7State.antsCount).toBe(8);
  expect(level7State.caterpillarsCount).toBe(2);
  expect(level7State.goalTarget).toBe(50);
  expect(level7State.antSpeed).toBe(82);
});

test("modal boxes (level banner, level HUD, and game over overlay) remain within screen bounds", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.setViewportSize({ width: 750, height: 360 });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // 1. Level banner is shown on start and must be within viewport
  const bannerBounds = await page.evaluate(() => {
    const banner = document.querySelector("#level-banner");
    const rect = banner.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(bannerBounds.left).toBeGreaterThanOrEqual(0);
  expect(bannerBounds.top).toBeGreaterThanOrEqual(0);
  expect(bannerBounds.right).toBeLessThanOrEqual(bannerBounds.windowWidth);
  expect(bannerBounds.bottom).toBeLessThanOrEqual(bannerBounds.windowHeight);

  // 2. Level HUD is centered and within viewport
  const hudBounds = await page.evaluate(() => {
    const hud = document.querySelector("#level-hud");
    const rect = hud.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(hudBounds.left).toBeGreaterThanOrEqual(0);
  expect(hudBounds.top).toBeGreaterThanOrEqual(0);
  expect(hudBounds.right).toBeLessThanOrEqual(hudBounds.windowWidth);
  expect(hudBounds.bottom).toBeLessThanOrEqual(hudBounds.windowHeight);

  // 3. Trigger Game Over overlay
  await page.evaluate(() => {
    window.__gameSceneForTest.overGame();
  });
  await expect(page.locator("#game-over-overlay")).toBeVisible();

  const gameOverPanelBounds = await page.evaluate(() => {
    const panel = document.querySelector("#game-over-overlay > div");
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(gameOverPanelBounds.left).toBeGreaterThanOrEqual(0);
  expect(gameOverPanelBounds.top).toBeGreaterThanOrEqual(0);
  expect(gameOverPanelBounds.right).toBeLessThanOrEqual(gameOverPanelBounds.windowWidth);
  expect(gameOverPanelBounds.bottom).toBeLessThanOrEqual(gameOverPanelBounds.windowHeight);

  const actionButtonsBounds = await page.evaluate(() => {
    const restart = document.querySelector("#game-over-restart").getBoundingClientRect();
    const home = document.querySelector("#game-over-home").getBoundingClientRect();
    return {
      restartBottom: restart.bottom,
      homeBottom: home.bottom,
      windowHeight: window.innerHeight
    };
  });
  expect(actionButtonsBounds.restartBottom).toBeLessThanOrEqual(actionButtonsBounds.windowHeight);
  expect(actionButtonsBounds.homeBottom).toBeLessThanOrEqual(actionButtonsBounds.windowHeight);
});

test("modal popups fit completely on short narrow landscape viewport (600x320)", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.setViewportSize({ width: 600, height: 320 });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // 1. Level banner is fully within bounds
  const bannerBounds = await page.evaluate(() => {
    const banner = document.querySelector("#level-banner");
    const rect = banner.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(bannerBounds.left).toBeGreaterThanOrEqual(0);
  expect(bannerBounds.top).toBeGreaterThanOrEqual(0);
  expect(bannerBounds.right).toBeLessThanOrEqual(bannerBounds.windowWidth);
  expect(bannerBounds.bottom).toBeLessThanOrEqual(bannerBounds.windowHeight);

  // 2. Trigger Game Over overlay
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.foods.getChildren().slice().forEach((food) => food.destroy());
  });
  await expect(page.locator("#game-over-overlay")).toBeVisible();

  const gameOverBounds = await page.evaluate(() => {
    const panel = document.querySelector("#game-over-overlay > div");
    const restart = document.querySelector("#game-over-restart");
    const home = document.querySelector("#game-over-home");
    const pRect = panel.getBoundingClientRect();
    const rRect = restart.getBoundingClientRect();
    const hRect = home.getBoundingClientRect();
    return {
      panelTop: pRect.top,
      panelBottom: pRect.bottom,
      restartBottom: rRect.bottom,
      homeBottom: hRect.bottom,
      windowHeight: window.innerHeight
    };
  });
  expect(gameOverBounds.panelTop).toBeGreaterThanOrEqual(0);
  expect(gameOverBounds.panelBottom).toBeLessThanOrEqual(gameOverBounds.windowHeight);
  expect(gameOverBounds.restartBottom).toBeLessThanOrEqual(gameOverBounds.windowHeight);
  expect(gameOverBounds.homeBottom).toBeLessThanOrEqual(gameOverBounds.windowHeight);
});

test("game over overlay displays the reached level", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=4");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.foods.getChildren().slice().forEach((food) => food.destroy());
  });

  await expect(page.locator("#game-over-overlay")).toBeVisible();
  const levelText = await page.locator("#game-over-level").textContent();
  expect(levelText).toBe("4");
});

test("carrier ants stealing food does not award defeat score or level progress", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=4");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const initialScore = await page.evaluate(() => window.__gameSceneForTest.score);
  const initialProgress = await page.evaluate(() => window.__gameSceneForTest.levelProgress);

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    const ant = scene.ants.getChildren().find((a) => a.active && a.isAlive);
    if (food && ant) {
      ant.stealFood(food);
      food.stealFoodAndDestroy();
    }
  });

  const finalScore = await page.evaluate(() => window.__gameSceneForTest.score);
  const finalProgress = await page.evaluate(() => window.__gameSceneForTest.levelProgress);

  expect(finalScore).toBe(initialScore);
  expect(finalProgress).toBe(initialProgress);
});

test("food dragging is blocked while level transition banner is active", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.completeLevel();
  });

  const isTransitioning = await page.evaluate(() => window.__gameSceneForTest.isLevelTransitioning);
  expect(isTransitioning).toBe(true);

  const dragResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    return food ? food.startDrag() : null;
  });

  expect(dragResult).toBe(false);
});

test("food destroy cleanly removes sprite from foods group without leaking", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const beforeCount = await page.evaluate(() => window.__gameSceneForTest.foods.getChildren().length);
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.destroy();
  });
  const afterCount = await page.evaluate(() => window.__gameSceneForTest.foods.getChildren().length);
  expect(afterCount).toBe(beforeCount - 1);
});

test("pause button toggles pause state, pauses physics and music, and shows pause overlay", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  const pauseToggle = page.locator("#pause-toggle");
  await expect(pauseToggle).toBeVisible();
  await expect(pauseToggle).toHaveText("⏸");

  const pauseOverlay = page.locator("#pause-overlay");
  await expect(pauseOverlay).toBeHidden();

  // 1. Click pause button
  await pauseToggle.click();
  await expect(pauseOverlay).toBeVisible();
  await expect(pauseOverlay).toContainText("Pausa");
  await expect(pauseToggle).toHaveText("▶");

  const isPausedState = await page.evaluate(() => ({
    isPaused: window.__gameSceneForTest.isPaused,
    physicsPaused: window.__gameSceneForTest.physics.world.isPaused
  }));
  expect(isPausedState.isPaused).toBe(true);
  expect(isPausedState.physicsPaused).toBe(true);

  // 2. Click resume inside the overlay
  await page.locator("#pause-resume").click();
  await expect(pauseOverlay).toBeHidden();
  await expect(pauseToggle).toHaveText("⏸");

  const isResumedState = await page.evaluate(() => ({
    isPaused: window.__gameSceneForTest.isPaused,
    physicsPaused: window.__gameSceneForTest.physics.world.isPaused
  }));
  expect(isResumedState.isPaused).toBe(false);
  expect(isResumedState.physicsPaused).toBe(false);

  // 3. Toggle via keyboard 'P'
  await page.keyboard.press("KeyP");
  await expect(pauseOverlay).toBeVisible();
  expect(await page.evaluate(() => window.__gameSceneForTest.isPaused)).toBe(true);

  // Toggle back via keyboard 'P'
  await page.keyboard.press("KeyP");
  await expect(pauseOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isPaused)).toBe(false);

  // 4. Toggle via 'Escape'
  await page.locator("#tilting-board").focus();
  await page.keyboard.press("Escape");
  await expect(pauseOverlay).toBeVisible();
  expect(await page.evaluate(() => window.__gameSceneForTest.isPaused)).toBe(true);

  // Test pause sound toggle button
  const pauseSoundBtn = page.locator("#pause-sound");
  await expect(pauseSoundBtn).toBeVisible();
  const initialMuted = await page.evaluate(() => window.__gameSceneForTest.audio.muted);
  await pauseSoundBtn.click();
  expect(await page.evaluate(() => window.__gameSceneForTest.audio.muted)).toBe(!initialMuted);
  await pauseSoundBtn.click();
  expect(await page.evaluate(() => window.__gameSceneForTest.audio.muted)).toBe(initialMuted);

  // Test restart level inside pause overlay
  await page.locator("#pause-restart").click();
  await waitForGameScene(page);
  await expect(pauseOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isPaused)).toBe(false);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // Test restart game inside pause overlay
  await pauseToggle.click();
  await expect(pauseOverlay).toBeVisible();
  await page.locator("#pause-restart-game").click();
  await waitForGameScene(page);
  await expect(pauseOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.score)).toBe(0);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // 5. Click home inside pause overlay
  await pauseToggle.click();
  await expect(pauseOverlay).toBeVisible();
  await page.locator("#pause-home").click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__titleSceneForTest?.sys.isActive()))).toBe(true);
});

test("pause overlay modal fits completely within screen bounds on short landscape (600x320)", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.setViewportSize({ width: 600, height: 320 });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  await page.locator("#pause-toggle").click();
  await expect(page.locator("#pause-overlay")).toBeVisible();

  const pauseBounds = await page.evaluate(() => {
    const panel = document.querySelector("#pause-overlay > div");
    const resume = document.querySelector("#pause-resume");
    const restart = document.querySelector("#pause-restart");
    const home = document.querySelector("#pause-home");
    const restartGame = document.querySelector("#pause-restart-game");
    const sound = document.querySelector("#pause-sound");
    const pRect = panel.getBoundingClientRect();
    return {
      panelTop: pRect.top,
      panelBottom: pRect.bottom,
      panelLeft: pRect.left,
      panelRight: pRect.right,
      resumeBottom: resume.getBoundingClientRect().bottom,
      restartBottom: restart.getBoundingClientRect().bottom,
      restartGameBottom: restartGame.getBoundingClientRect().bottom,
      soundBottom: sound.getBoundingClientRect().bottom,
      homeBottom: home.getBoundingClientRect().bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(pauseBounds.panelLeft).toBeGreaterThanOrEqual(0);
  expect(pauseBounds.panelTop).toBeGreaterThanOrEqual(0);
  expect(pauseBounds.panelRight).toBeLessThanOrEqual(pauseBounds.windowWidth);
  expect(pauseBounds.panelBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
  expect(pauseBounds.resumeBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
  expect(pauseBounds.restartBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
  expect(pauseBounds.restartGameBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
  expect(pauseBounds.soundBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
  expect(pauseBounds.homeBottom).toBeLessThanOrEqual(pauseBounds.windowHeight);
});


test("level complete overlay displays when level goal is met, pauses physics, hides pause button, and advances on continue", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  const pauseToggle = page.locator("#pause-toggle");
  await expect(pauseToggle).toBeVisible();

  // Complete level
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.completeLevel();
  });

  const levelCompleteOverlay = page.locator("#level-complete-overlay");
  await expect(levelCompleteOverlay).toBeVisible();

  // Pause toggle button is hidden while level complete overlay is open
  await expect(pauseToggle).toBeHidden();

  // Physics is paused while waiting for continue
  const isPhysicsPaused = await page.evaluate(() => window.__gameSceneForTest.physics.world.isPaused);
  expect(isPhysicsPaused).toBe(true);

  // Calling togglePause does not open pause overlay while level complete is active
  await page.evaluate(() => window.__gameSceneForTest.togglePause());
  await expect(page.locator("#pause-overlay")).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isPaused)).toBe(false);

  // Pressing Enter continues to next level
  await page.keyboard.press("Enter");
  await expect(levelCompleteOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.currentLevel)).toBe(2);

  // Level 2 intro modal displays before level 2 starts with confirmation button
  await expect(page.locator("#level-banner")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Nivel 2");
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#level-banner")).toBeHidden();

  // Physics resumes and pause button reappears
  expect(await page.evaluate(() => window.__gameSceneForTest.physics.world.isPaused)).toBe(false);
  await expect(pauseToggle).toBeVisible();
});

test("level complete overlay modal fits completely within screen bounds on short landscape (600x320)", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.setViewportSize({ width: 600, height: 320 });
  await page.goto("/");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.completeLevel();
  });

  const levelCompleteOverlay = page.locator("#level-complete-overlay");
  await expect(levelCompleteOverlay).toBeVisible();

  const bounds = await page.evaluate(() => {
    const panel = document.querySelector("#level-complete-overlay > div");
    const continueBtn = document.querySelector("#level-complete-continue");
    const pRect = panel.getBoundingClientRect();
    const btnRect = continueBtn.getBoundingClientRect();
    return {
      panelTop: pRect.top,
      panelBottom: pRect.bottom,
      panelLeft: pRect.left,
      panelRight: pRect.right,
      btnBottom: btnRect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });

  expect(bounds.panelLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.panelTop).toBeGreaterThanOrEqual(0);
  expect(bounds.panelRight).toBeLessThanOrEqual(bounds.windowWidth);
  expect(bounds.panelBottom).toBeLessThanOrEqual(bounds.windowHeight);
  expect(bounds.btnBottom).toBeLessThanOrEqual(bounds.windowHeight);
});

test("level intro modal displays before each level with confirmation button to read rules, pauses gameplay until confirmed", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const banner = page.locator("#level-banner");
  const confirmBtn = page.locator("#level-banner-confirm");
  const title = page.locator("#level-banner-title");
  const instruction = page.locator("#level-banner-instruction");

  // 1. Intro modal is visible on start with level rules and confirmation button
  await expect(banner).toBeVisible();
  await expect(confirmBtn).toBeVisible();
  await expect(confirmBtn).toHaveText("¡A jugar!");
  await expect(title).toHaveText("Nivel 1");
  await expect(instruction).toContainText("comida");

  // 2. Physics is paused while reading the rules
  const isPhysicsPaused = await page.evaluate(() => window.__gameSceneForTest.physics.world.isPaused);
  const isIntroActive = await page.evaluate(() => window.__gameSceneForTest.isLevelIntroActive);
  expect(isPhysicsPaused).toBe(true);
  expect(isIntroActive).toBe(true);

  // 3. Confirming begins Level 1 gameplay and resumes physics
  await confirmBtn.click();
  await expect(banner).toBeHidden();
  const isRunning = await page.evaluate(() => ({
    introActive: window.__gameSceneForTest.isLevelIntroActive,
    physicsPaused: window.__gameSceneForTest.physics.world.isPaused
  }));
  expect(isRunning.introActive).toBe(false);
  expect(isRunning.physicsPaused).toBe(false);

  // 4. Advancing to Level 2 brings up Level 2 rules modal with confirmation button
  await page.evaluate(() => window.__gameSceneForTest.completeLevel());
  await page.locator("#level-complete-continue").click();

  await expect(banner).toBeVisible();
  await expect(title).toHaveText("Nivel 2");
  await expect(confirmBtn).toBeVisible();
  expect(await page.evaluate(() => window.__gameSceneForTest.isLevelIntroActive)).toBe(true);

  // 5. Pressing Enter confirms and begins Level 2
  await page.keyboard.press("Enter");
  await expect(banner).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isLevelIntroActive)).toBe(false);
  expect(await page.evaluate(() => window.__gameSceneForTest.physics.world.isPaused)).toBe(false);
});


test("levels with tilt disabled do not apply tilt physics or phone orientation to moving ants", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // Baseline calibration
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
      beta: 0,
      gamma: 0
    }));
  });

  // 1. Tilt phone while in Tutorial 1 (tiltEnabled: false)
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
      beta: 30,
      gamma: 30
    }));
  });

  // Gravity must remain 0 and board un-tilted
  const level1State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.addNewAnt();
    const ant = scene.ants.getChildren()[0];
    ant.ANT_SPEED = scene.currentLevelConfig.antSpeed;
    ant.setVelocity(100, 0);
    return {
      gravity: { x: scene.gravity.x, y: scene.gravity.y },
      antVx: ant.body.velocity.x,
      isTiltEnabled: scene.isTiltEnabled,
      transform: document.querySelector("#tilting-board").style.transform
    };
  });

  expect(level1State.isTiltEnabled).toBe(false);
  expect(level1State.gravity).toEqual({ x: 0, y: 0 });
  expect(level1State.transform).toBe("perspective(900px) rotateX(0deg) rotateY(0deg)");
  // Pure pursuit velocity without gravity acceleration (-45 along x axis for level 1 antSpeed)
  expect(level1State.antVx).toBe(-45);

  // 2. Switch to Game Level 1 (tiltEnabled: true)
  await page.evaluate(() => window.__gameSceneForTest.startLevel(1, false));

  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
      beta: 30,
      gamma: 30
    }));
  });

  const level4State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    ant.setVelocity(100, 0);
    return {
      gravity: { x: scene.gravity.x, y: scene.gravity.y },
      antVx: ant.body.velocity.x,
      isTiltEnabled: scene.isTiltEnabled
    };
  });

  expect(level4State.isTiltEnabled).toBe(true);
  expect(level4State.gravity.x).not.toBe(0);
  // In Game Level 1, tilt physics applies gravity to ant velocity
  expect(level4State.antVx).not.toBe(-58);
});


test("tutorial 1 starts with only one food and no ants, and passes when the user moves the food", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // 1. Tutorial 1 starts with only 1 food and no ants
  const startingState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      foodCount: scene.foodCount,
      foodSprites: scene.foods.getChildren().length,
      antCount: scene.ants.getChildren().length,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      goalType: scene.currentLevelConfig.goalType,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(startingState.foodCount).toBe(1);
  expect(startingState.foodSprites).toBe(1);
  expect(startingState.antCount).toBe(0);
  expect(startingState.isTiltEnabled).toBe(false);
  expect(startingState.isDragEnabled).toBe(true);
  expect(startingState.goalType).toBe("move_food");
  expect(startingState.hudText).toContain("TUTORIAL 1");
  expect(startingState.hudText).toContain("MUEVE LA COMIDA: 0/1");

  // Confirm intro banner
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // 2. Drag and move the food to pass Tutorial 1
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.startDrag();
    food.moveDrag(food.x + 60, food.y + 40);
    food.finishDrag();
  });

  // Level complete overlay appears
  const completeOverlay = page.locator("#level-complete-overlay");
  await expect(completeOverlay).toBeVisible();
  await expect(completeOverlay).toContainText("Tutorial 1");
  await expect(completeOverlay).toContainText("Tutorial 2");

  // Advance to Tutorial 2
  await page.locator("#level-complete-continue").click();
  await expect(completeOverlay).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.currentLevel)).toBe(2);
  expect(await page.evaluate(() => window.__gameSceneForTest.isTutorialMode)).toBe(true);

  // Tutorial 2 has 1 food carried by 1 stationary ant
  await expect.poll(() => page.evaluate(() => window.__gameSceneForTest.foodCount)).toBe(1);
  const carriedState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const ant = scene.ants.getChildren()[0];
    return {
      isBeingCarried: food.isBeingCarried,
      antCarrying: Boolean(ant.carriedFood)
    };
  });
  expect(carriedState.isBeingCarried).toBe(true);
  expect(carriedState.antCarrying).toBe(true);
});

test("tutorial 2 starts with one food carried by a stationary ant and passes when shaken hard", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=2");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // Tutorial 2 intro banner displays
  await expect(page.locator("#level-banner")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Tutorial 2");
  await expect(page.locator("#level-banner-subtitle")).toHaveText("¡Sacude la comida!");
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // Verify initial state: exactly 1 food, 1 ant, carried, antSpeed = 0
  const initialState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const ant = scene.ants.getChildren()[0];
    return {
      foodCount: scene.foodCount,
      antCount: scene.ants.getChildren().length,
      isBeingCarried: food.isBeingCarried,
      antCarrying: Boolean(ant.carriedFood),
      antSpeed: scene.currentLevelConfig.antSpeed,
      antX: ant.x,
      antY: ant.y,
      foodX: food.x,
      foodY: food.y,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(initialState.foodCount).toBe(1);
  expect(initialState.antCount).toBe(1);
  expect(initialState.isBeingCarried).toBe(true);
  expect(initialState.antCarrying).toBe(true);
  expect(initialState.antSpeed).toBe(0);
  expect(initialState.hudText).toContain("TUTORIAL 2");
  expect(initialState.hudText).toContain("SACUDE LA COMIDA: 0/1");

  // Verify the ant and carried food are not moving after waiting
  await page.waitForTimeout(200);
  const afterWait = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    const ant = scene.ants.getChildren()[0];
    return {
      antX: ant.x,
      antY: ant.y,
      foodX: food.x,
      foodY: food.y
    };
  });
  expect(Math.abs(afterWait.antX - initialState.antX)).toBeLessThan(1);
  expect(Math.abs(afterWait.antY - initialState.antY)).toBeLessThan(1);
  expect(Math.abs(afterWait.foodX - initialState.foodX)).toBeLessThan(1);
  expect(Math.abs(afterWait.foodY - initialState.foodY)).toBeLessThan(1);

  // Moving gently in a straight line does NOT shake off the ant or pass the level
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.startDrag();
    food.moveDrag(food.x + 30, food.y + 30);
    food.finishDrag();
  });
  const afterLinearMove = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    return {
      isBeingCarried: food.isBeingCarried,
      levelProgress: scene.levelProgress,
      isComplete: scene.isLevelCompleteActive
    };
  });
  expect(afterLinearMove.isBeingCarried).toBe(true);
  expect(afterLinearMove.levelProgress).toBe(0);
  expect(afterLinearMove.isComplete).toBe(false);
  await expect(page.locator("#level-complete-overlay")).toBeHidden();

  // Shaking hard back and forth shakes off the ant and passes Tutorial 2
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren()[0];
    food.clearDragTimers();
    food.isDragCooldown = false;
    const t0 = performance.now();
    food.startDrag(undefined, t0);
    food.moveDrag(food.x - 25, food.y, t0 + 40);
    food.moveDrag(food.x + 30, food.y, t0 + 80);
    food.moveDrag(food.x - 25, food.y, t0 + 120);
    food.finishDrag();
  });

  const levelCompleteOverlay = page.locator("#level-complete-overlay");
  await expect(levelCompleteOverlay).toBeVisible();
  await expect(levelCompleteOverlay).toContainText("Tutorial 2");
  await expect(page.locator("#level-hud")).toContainText("SACUDE LA COMIDA: 1/1");
});

test("tutorial 3 starts with only one ant in the center of the tray and passes when tilted to make it fall out", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=3");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  // Tutorial 3 intro banner displays
  await expect(page.locator("#level-banner")).toBeVisible();
  await expect(page.locator("#level-banner-title")).toHaveText("Tutorial 3");
  await expect(page.locator("#level-banner-subtitle")).toHaveText("¡Inclina la bandeja!");
  await expect(page.locator("#level-banner-instruction")).toHaveText("Tira la hormiga.");
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // Verify initial state: exactly 0 food, exactly 1 ant placed at tray center
  const initialState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    const tray = scene.tray;
    return {
      foodCount: scene.foodCount,
      foodsLength: scene.foods.getChildren().length,
      antCount: scene.ants.getChildren().length,
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled,
      isWaitingForNeutralTilt: scene.isWaitingForNeutralTilt,
      antX: ant.x,
      antY: ant.y,
      trayX: tray.x,
      trayY: tray.y,
      isClimbing: ant.isClimbing,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(initialState.foodCount).toBe(0);
  expect(initialState.foodsLength).toBe(0);
  expect(initialState.antCount).toBe(1);
  expect(initialState.isTiltEnabled).toBe(true);
  expect(initialState.isDragEnabled).toBe(false);
  expect(initialState.isWaitingForNeutralTilt).toBe(true);
  expect(initialState.isClimbing).toBe(false);
  expect(Math.abs(initialState.antX - initialState.trayX)).toBeLessThan(1);
  expect(Math.abs(initialState.antY - initialState.trayY)).toBeLessThan(1);
  expect(initialState.hudText).toContain("TUTORIAL 3");
  expect(initialState.hudText).toContain("NIVELA LA BANDEJA");

  // Balance guide is visible and gives real-time visual feedback to level the device
  const balanceGuide = page.locator("#neutral-balance-guide");
  const balanceBubble = page.locator("#balance-bubble");
  const balanceInstruction = page.locator("#balance-instruction");
  await expect(balanceGuide).toBeVisible();

  // While waiting for neutral tilt, tilting with arrow keys moves the balance bubble and updates instructions
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(100);
  await expect(balanceInstruction).toContainText("nivelar");
  const bubbleTransform = await balanceBubble.evaluate((el) => el.style.transform);
  expect(bubbleTransform).not.toBe("translate(-50%, -50%) translate(0.0px, 0.0px)");

  const stillCentered = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    const tray = scene.tray;
    return Math.hypot(ant.x - tray.x, ant.y - tray.y);
  });
  expect(stillCentered).toBeLessThan(1);
  await page.keyboard.up("ArrowRight");

  // Releasing arrow keys returns to neutral position and completes hold; HUD updates and balance guide hides
  await expect.poll(() => page.locator("#level-hud").textContent()).toContain("HORMIGAS: 0/1");
  await expect(balanceGuide).toBeHidden();
  expect(await page.evaluate(() => window.__gameSceneForTest.isWaitingForNeutralTilt)).toBe(false);

  // Now tilt the board with ArrowRight so the ant falls off the tray
  await page.keyboard.down("ArrowRight");
  try {
    await expect
      .poll(() => page.locator("#tilting-board").evaluate((el) => el.style.transform))
      .toBe("perspective(900px) rotateX(0deg) rotateY(10deg)");

    const levelCompleteOverlay = page.locator("#level-complete-overlay");
    await expect(levelCompleteOverlay).toBeVisible({ timeout: 5000 });
    await expect(levelCompleteOverlay).toContainText("¡Tutorial completado!");
    await expect(page.locator("#level-hud")).toContainText("HORMIGAS: 1/1");
  } finally {
    await page.keyboard.up("ArrowRight");
  }

  // Completing Tutorial 3 marks tutorial complete in localStorage
  expect(await page.evaluate(() => localStorage.getItem("tutorialCompleted"))).toBe("true");

  // Advancing from Tutorial 3 continues to Game Level 1
  await page.locator("#level-complete-continue").click();
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  expect(await page.evaluate(() => window.__gameSceneForTest.currentLevel)).toBe(1);
  expect(await page.evaluate(() => window.__gameSceneForTest.isTutorialMode)).toBe(false);
});

test("ants walk randomly searching for food on the tray when the only remaining food is dragged", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=4");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  await expect(page.locator("#level-banner")).toBeVisible();
  await page.locator("#level-banner-confirm").click();
  await expect(page.locator("#level-banner")).toBeHidden();

  // Setup: leave exactly 1 remaining active food on the tray, and ensure living ants exist
  const setupResult = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const foods = scene.foods.getChildren().filter((f) => f.active && f.body?.enable);
    for (let i = 1; i < foods.length; i++) {
      foods[i].disableBody(true, true);
    }
    const singleFood = foods[0];
    singleFood.clearDragTimers();
    singleFood.isDragCooldown = false;
    singleFood.isBeingDragged = false;
    singleFood.releaseAllCarriers(false);

    const ants = scene.ants.getChildren().filter((a) => a.active && a.isAlive);
    ants.forEach((a) => {
      a.isClimbing = false;
      a.setPosition(scene.tray.x + Phaser.Math.Between(-80, 80), scene.tray.y + Phaser.Math.Between(-40, 40));
    });

    return {
      activeFoodCount: scene.foods.getChildren().filter((f) => f.active && f.body?.enable).length,
      antCount: ants.length
    };
  });

  expect(setupResult.activeFoodCount).toBe(1);
  expect(setupResult.antCount).toBeGreaterThanOrEqual(2);

  // 1. Drag the only remaining food
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    food.startDrag();
    food.moveDrag(food.x + 10, food.y + 10);
  });

  const isDragging = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    return food.isBeingDragged;
  });
  expect(isDragging).toBe(true);

  // 2. While dragged, verify ants are searching and actively moving on the tray without walking off
  await page.waitForTimeout(400);

  const searchState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ants = scene.ants.getChildren().filter((a) => a.active && a.isAlive);
    const trayBounds = scene.tray.getBounds();
    return {
      antCount: ants.length,
      allSearching: ants.every((a) => a.shouldSearchForFood()),
      allMoving: ants.every((a) => Math.hypot(a.body?.velocity.x ?? 0, a.body?.velocity.y ?? 0) > 10),
      allInsideTray: ants.every((a) => {
        return (
          a.x >= trayBounds.left &&
          a.x <= trayBounds.right &&
          a.y >= trayBounds.top &&
          a.y <= trayBounds.bottom
        );
      })
    };
  });

  expect(searchState.allSearching).toBe(true);
  expect(searchState.allMoving).toBe(true);
  expect(searchState.allInsideTray).toBe(true);
  expect(searchState.antCount).toBe(setupResult.antCount);

  // 3. Drop/finish dragging the food
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    food.finishDrag();
  });

  await page.waitForTimeout(100);

  // 4. Verify ants resume targeting the dropped food
  const resumedTargeting = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    const ants = scene.ants.getChildren().filter((a) => a.active && a.isAlive);
    return {
      foodBeingDragged: food.isBeingDragged,
      antsTargetingFood: ants.filter((a) => a.myFood === food).length
    };
  });

  expect(resumedTargeting.foodBeingDragged).toBe(false);
  expect(resumedTargeting.antsTargetingFood).toBeGreaterThanOrEqual(1);
});


test("tutorial levels are shown only on first play and separated from game levels", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);

  // 1. First play with clean storage starts in Tutorial 1
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const firstPlayState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      isTutorialMode: scene.isTutorialMode,
      currentLevel: scene.currentLevel,
      title: scene.currentLevelConfig.title,
      hudText: document.querySelector("#level-hud")?.textContent ?? ""
    };
  });
  expect(firstPlayState.isTutorialMode).toBe(true);
  expect(firstPlayState.currentLevel).toBe(1);
  expect(firstPlayState.title).toBe("Tutorial 1");
  expect(firstPlayState.hudText).toContain("TUTORIAL 1");

  // 2. Once tutorialCompleted is saved in storage, fresh play starts at Game Level 1
  await page.evaluate(() => {
    localStorage.setItem("tutorialCompleted", "true");
  });
  await page.reload();
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const secondPlayState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      isTutorialMode: scene.isTutorialMode,
      currentLevel: scene.currentLevel,
      title: scene.currentLevelConfig.title,
      hudText: document.querySelector("#level-hud")?.textContent ?? "",
      isTiltEnabled: scene.isTiltEnabled,
      isDragEnabled: scene.isDragEnabled
    };
  });
  expect(secondPlayState.isTutorialMode).toBe(false);
  expect(secondPlayState.currentLevel).toBe(1);
  expect(secondPlayState.title).toBe("Nivel 1");
  expect(secondPlayState.hudText).toContain("NIVEL 1");
  expect(secondPlayState.isTiltEnabled).toBe(true);
  expect(secondPlayState.isDragEnabled).toBe(true);

  // 3. Restarting from pause menu restarts at Game Level 1 (not tutorial)
  await page.locator("#level-banner-confirm").click();
  await page.locator("#pause-toggle").click();
  await page.locator("#pause-restart-game").click();
  await waitForGameScene(page);

  const restartState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      isTutorialMode: scene.isTutorialMode,
      currentLevel: scene.currentLevel,
      title: scene.currentLevelConfig.title
    };
  });
  expect(restartState.isTutorialMode).toBe(false);
  expect(restartState.currentLevel).toBe(1);
  expect(restartState.title).toBe("Nivel 1");

  // 4. URL query param explicitly starting tutorial still works
  await page.goto("/?tutorial=2");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);

  const explicitTutorialState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      isTutorialMode: scene.isTutorialMode,
      currentLevel: scene.currentLevel,
      title: scene.currentLevelConfig.title
    };
  });
  expect(explicitTutorialState.isTutorialMode).toBe(true);
  expect(explicitTutorialState.currentLevel).toBe(2);
  expect(explicitTutorialState.title).toBe("Tutorial 2");
});

test("neutral balance guide is positioned responsively by syncVisualLayerBounds and reparented correctly", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=3");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();

  const guide = page.locator("#neutral-balance-guide");
  await expect(guide).toBeVisible();

  const guideMetrics = await page.evaluate(() => {
    const el = document.querySelector("#neutral-balance-guide");
    const parent = window.__gameSceneForTest.visualLayerParent;
    return {
      top: el?.style.top,
      fontSize: el?.style.fontSize,
      isChildOfParent: el?.parentElement === parent
    };
  });

  expect(guideMetrics.isChildOfParent).toBe(true);
  expect(guideMetrics.top).toMatch(/px$/);
  expect(parseFloat(guideMetrics.top)).toBeGreaterThan(0);
});

test("food eat state and texture are cleanly reset on level refill", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=2");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    if (food) {
      food.beingEat({ x: food.x - 10, y: food.y });
    }
  });

  const beforeRefill = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    return {
      isBeingEaten: food?.isBeingEaten,
      hasTextureKey: Boolean(food?.texture?.key && food.texture.key.startsWith("eaten_food_"))
    };
  });
  expect(beforeRefill.isBeingEaten).toBe(true);
  expect(beforeRefill.hasTextureKey).toBe(true);

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.refillFoods();
  });

  const afterRefill = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const food = scene.foods.getChildren().find((f) => f.active && f.body?.enable);
    return {
      isBeingEaten: food?.isBeingEaten,
      textureKey: food?.texture?.key,
      isWormEating: food?.isWormEating
    };
  });
  expect(afterRefill.isBeingEaten).toBe(false);
  expect(afterRefill.isWormEating).toBe(false);
  expect(afterRefill.textureKey).toBe("food");
});

test("graduating from tutorial to game level 1 resets score to zero and prevents tutorial ant spawns", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?tutorial=3");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.score = 6;
  });

  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const ant = scene.ants.getChildren()[0];
    scene.antDied(ant);
  });

  const antCountInTutorial3 = await page.evaluate(() => window.__gameSceneForTest.ants.getChildren().length);
  expect(antCountInTutorial3).toBe(1);

  await page.locator("#level-complete-continue").click();
  await waitForGameScene(page);

  const level1State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      isTutorialMode: scene.isTutorialMode,
      currentLevel: scene.currentLevel,
      score: scene.score,
      scoreLabelText: scene.scoreLabel.textContent
    };
  });
  expect(level1State.isTutorialMode).toBe(false);
  expect(level1State.currentLevel).toBe(1);
  expect(level1State.score).toBe(0);
  expect(level1State.scoreLabelText).toBe("0");
});


test("food carries over across levels without refilling and game ends when all food is lost", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.goto("/?level=1");
  await clickStartOnCanvas(page);
  await waitForGameScene(page);
  await page.locator("#level-banner-confirm").click();

  // Initial Level 1 state: 8 food pieces
  const initialFoodCount = await page.evaluate(() => window.__gameSceneForTest.foodCount);
  expect(initialFoodCount).toBe(8);

  // Steal / destroy 3 pieces of food during Level 1
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const foods = scene.foods.getChildren().slice(0, 3);
    foods.forEach((food) => {
      scene.destroyFood(food);
      food.disableBody(true, true);
      food.destroy();
    });
  });

  const remainingInLevel1 = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      foodCount: scene.foodCount,
      activeSprites: scene.foods.getChildren().filter((f) => f.active && f.body?.enable).length
    };
  });
  expect(remainingInLevel1.foodCount).toBe(5);
  expect(remainingInLevel1.activeSprites).toBe(5);

  // Complete Level 1 by meeting ant defeat goal
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    scene.levelProgress = 20;
    scene.checkLevelCompletion();
  });

  await expect(page.locator("#level-complete-overlay")).toBeVisible();
  await page.locator("#level-complete-continue").click();
  await expect(page.locator("#level-banner-confirm")).toBeVisible();
  await page.locator("#level-banner-confirm").click();

  // In Level 2, NO new food should have reappeared. Exactly 5 foods must remain!
  const level2State = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      currentLevel: scene.currentLevel,
      foodCount: scene.foodCount,
      activeSprites: scene.foods.getChildren().filter((f) => f.active && f.body?.enable).length
    };
  });
  expect(level2State.currentLevel).toBe(2);
  expect(level2State.foodCount).toBe(5);
  expect(level2State.activeSprites).toBe(5);

  // Steal / destroy all remaining 5 pieces of food in Level 2
  await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    const remainingFoods = scene.foods.getChildren().filter((f) => f.active && f.body?.enable);
    remainingFoods.forEach((food) => {
      scene.destroyFood(food);
      food.disableBody(true, true);
      food.destroy();
    });
  });

  // When all food is lost, Game Over overlay appears immediately!
  await expect(page.locator("#game-over-overlay")).toBeVisible();
  const gameOverState = await page.evaluate(() => {
    const scene = window.__gameSceneForTest;
    return {
      gameOver: scene.gameOver,
      foodCount: scene.foodCount
    };
  });
  expect(gameOverState.gameOver).toBe(true);
  expect(gameOverState.foodCount).toBe(0);
});
