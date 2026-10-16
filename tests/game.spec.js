const { expect, test } = require("@playwright/test");

test("production build loads its assets and starts a game", async ({ page }) => {
  const pageErrors = [];
  const failedResponses = [];
  const loadedAssets = new Set();
  const requiredAssets = [
    "/assets/images/grass.png",
    "/assets/images/trayWithCompleteClothe.png",
    "/assets/images/food.png",
    "/assets/images/ant_sheet.png"
  ];

  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (requiredAssets.includes(pathname) && response.ok()) {
      loadedAssets.add(pathname);
    }
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Ants Feast");
  const canvas = page.locator("#game canvas").first();
  await expect(canvas).toBeVisible();
  await expect.poll(() => [...loadedAssets]).toHaveLength(requiredAssets.length);

  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect(page.locator("#tilting-board")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("Vite development server loads its assets and starts a game", async ({ page }) => {
  const pageErrors = [];
  const failedResponses = [];
  const loadedAssets = new Set();
  const requiredAssets = [
    "/assets/images/grass.png",
    "/assets/images/trayWithCompleteClothe.png",
    "/assets/images/food.png",
    "/assets/images/ant_sheet.png"
  ];

  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (requiredAssets.includes(pathname) && response.ok()) {
      loadedAssets.add(pathname);
    }
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("http://127.0.0.1:4174/dev.html");
  await expect(page).toHaveTitle("Ants Feast");
  const canvas = page.locator("#game canvas").first();
  await expect(canvas).toBeVisible();
  await expect.poll(() => [...loadedAssets]).toHaveLength(requiredAssets.length);

  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect(page.locator("#tilting-board")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("tilt controls apply perspective on both axes", async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });

  await page.goto("/");
  const canvas = page.locator("#game canvas").first();
  const tiltedBoard = page.locator("#tilting-board");
  const stationaryHud = page.locator("#stationary-hud");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect(tiltedBoard).toBeVisible();
  await expect(stationaryHud).toBeVisible();
  expect(await page.locator("#game").locator("#tilting-board-layer").count()).toBe(1);
  expect(await page.locator("#game").locator("#stationary-hud").count()).toBe(1);
  await expect
    .poll(() => tiltedBoard.evaluate((element) => {
      const pixels = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }))
    .toBe(true);
  const renderedDebugColors = await tiltedBoard.evaluate((element) => {
    const context = element.getContext("2d");
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    const palette = [
      [255, 65, 54],
      [0, 116, 217],
      [46, 204, 64],
      [255, 133, 27],
      [177, 13, 201],
      [57, 204, 204],
      [240, 18, 190],
      [255, 220, 0]
    ];

    return palette.map(([red, green, blue]) => {
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === red && pixels[index + 1] === green && pixels[index + 2] === blue) {
          count++;
        }
      }
      return count;
    }).filter((count) => count > 0).length;
  });
  expect(renderedDebugColors).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => stationaryHud.evaluate((element) => {
      const pixels = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }))
    .toBe(true);

  const alignedBounds = await Promise.all([
    canvas.boundingBox(),
    page.locator("#tilting-board-layer").boundingBox(),
    stationaryHud.boundingBox()
  ]);
  expect(alignedBounds[1]).toEqual(alignedBounds[0]);
  expect(alignedBounds[2]).toEqual(alignedBounds[0]);

  const directions = [
    ["ArrowRight", "rotateX(0deg) rotateY(10deg)"],
    ["ArrowLeft", "rotateX(0deg) rotateY(-10deg)"],
    ["ArrowUp", "rotateX(10deg) rotateY(0deg)"],
    ["ArrowDown", "rotateX(-10deg) rotateY(0deg)"]
  ];
  for (const [key, expectedTransform] of directions) {
    await page.keyboard.down(key);
    try {
      await expect
        .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
        .toBe(expectedTransform);
      await expect(canvas).toHaveCSS("transform", "none");
      await expect(stationaryHud).toHaveCSS("transform", "none");
    } finally {
      await page.keyboard.up(key);
    }
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("rotateX(0deg) rotateY(0deg)");
  }

  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowUp");
  try {
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("rotateX(10deg) rotateY(10deg)");
    await expect(canvas).toHaveCSS("transform", "none");
    await expect(stationaryHud).toHaveCSS("transform", "none");
  } finally {
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("ArrowUp");
  }
});

test("mobile device orientation visibly tilts the board", async ({ browser }) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"
  });

  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.resolve();
      window.addEventListener("load", () => {
        const sceneManager = window.Phaser.Scenes.SceneManager.prototype;
        const startScene = sceneManager.start;
        sceneManager.start = function (key, ...args) {
          const result = startScene.call(this, key, ...args);
          if (key === "GameScene") {
            window.__gameSceneForTest = this.getScene(key);
          }
          return result;
        };
      }, { once: true });
    });
    await page.goto("/?sensorDebug=1");
    const gameCanvas = page.locator("#game canvas").first();
    await expect(gameCanvas).toBeVisible();
    const bounds = await gameCanvas.boundingBox();
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);

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
      .toBe("rotateX(0deg) rotateY(10deg)");
    await expect.poll(() => page.evaluate(() => ({
      x: window.__gameSceneForTest.gravity.x,
      y: window.__gameSceneForTest.gravity.y
    }))).toEqual({ x: 30, y: 0 });
    await expect(page.locator("pre")).toContainText(/Orientation events: [1-9]\d*/);
    await expect(page.locator("pre")).toContainText(/Motion events: [1-9]\d*/);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("game over saves a new high score and restarts the round", async ({ page }) => {
  const pageErrors = [];
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
    localStorage.clear();
    localStorage.setItem("highScore", "2");

    window.addEventListener("load", () => {
      const sceneManager = window.Phaser.Scenes.SceneManager.prototype;
      const startScene = sceneManager.start;
      sceneManager.start = function (key, ...args) {
        const result = startScene.call(this, key, ...args);
        if (key === "GameScene") {
          window.__gameSceneForTest = this.getScene(key);
        }
        return result;
      };
    }, { once: true });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const canvas = page.locator("#game canvas").first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect(page.locator("#tilting-board")).toBeVisible();

  await expect.poll(() => page.evaluate(() => Boolean(window.__gameSceneForTest))).toBe(true);
  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.score = 5;
    gameScene.scoreText.setText("5");
    gameScene.foods.getChildren().slice().forEach((food) => food.destroy());
  });

  await expect.poll(() => page.evaluate(() => ({
    gameOver: window.__gameSceneForTest.gameOver,
    foodCount: window.__gameSceneForTest.foodCount,
    highScore: localStorage.getItem("highScore")
  }))).toEqual({
    gameOver: true,
    foodCount: 0,
    highScore: "5"
  });

  await expect.poll(() => page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    const availableFood = gameScene.foods.getChildren()
      .filter((food) => food.body.enable).length;
    return {
      gameOver: gameScene.gameOver,
      score: gameScene.score,
      foodCount: gameScene.foodCount,
      availableFood,
      highScoreText: gameScene.highScoreText.text,
      highScore: localStorage.getItem("highScore")
    };
  }), { timeout: 8_000 }).toEqual({
    gameOver: false,
    score: 0,
    foodCount: 8,
    availableFood: 8,
    highScoreText: "HI 5",
    highScore: "5"
  });
  expect(pageErrors).toEqual([]);
});
