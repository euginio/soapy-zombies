const { expect, test } = require("@playwright/test");

async function stubFullscreenAndExposeScenes(page) {
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
        if (key === "TitleScene") {
          window.__titleSceneForTest = this.getScene(key);
        }
        return result;
      };
    }, { once: true });
  });
}

async function clickStartOnCanvas(page) {
  const canvas = page.locator("#game canvas").first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  return canvas;
}

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
    await page.goto("/");
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
    const recenterButton = page.locator("#recenter-device-tilt");
    await expect(recenterButton).toBeVisible();
    await recenterButton.click();
    await expect.poll(() => page.evaluate(() => ({
      x: window.__gameSceneForTest.gravity.x,
      y: window.__gameSceneForTest.gravity.y
    }))).toEqual({ x: 0, y: 0 });
    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        beta: 0,
        gamma: 45
      }));
    });
    await expect.poll(() => page.evaluate(() => ({
      x: window.__gameSceneForTest.gravity.x,
      y: window.__gameSceneForTest.gravity.y
    }))).toEqual({ x: 15, y: 0 });
    await page.evaluate(() => {
      const target = document.createElement("div");
      target.id = "simulated-fullscreen-target";
      target.style.cssText = "position:relative;width:580px;height:300px";
      document.body.appendChild(target);
      window.__gameCanvasForFullscreenTest = document.querySelector("#game canvas");
      window.__originalCanvasParentForFullscreenTest = window.__gameCanvasForFullscreenTest.parentElement;
      target.appendChild(window.__gameCanvasForFullscreenTest);
    });
    await expect.poll(() => page.evaluate(() => {
      const fullscreenTarget = document.querySelector("#simulated-fullscreen-target");
      return [
        document.querySelector("#tilting-board-layer").parentElement === fullscreenTarget,
        document.querySelector("#stationary-hud").parentElement === fullscreenTarget,
        document.querySelector("#recenter-device-tilt").parentElement === fullscreenTarget
      ];
    })).toEqual([true, true, true]);
    await page.evaluate(() => {
      window.__originalCanvasParentForFullscreenTest.appendChild(window.__gameCanvasForFullscreenTest);
      delete window.__gameCanvasForFullscreenTest;
      delete window.__originalCanvasParentForFullscreenTest;
      document.querySelector("#simulated-fullscreen-target").remove();
    });
    await expect.poll(() => page.evaluate(() => {
      const canvasParent = document.querySelector("#game canvas").parentElement;
      return [
        document.querySelector("#tilting-board-layer").parentElement === canvasParent,
        document.querySelector("#stationary-hud").parentElement === canvasParent,
        document.querySelector("#recenter-device-tilt").parentElement === canvasParent
      ];
    })).toEqual([true, true, true]);
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

test("new game shows the saved high score and starting ant and food counts", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("highScore", "9");
  });

  await page.goto("/");
  await clickStartOnCanvas(page);
  await expect(page.locator("#tilting-board")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    score: window.__gameSceneForTest.score,
    scoreText: window.__gameSceneForTest.scoreText.text,
    highScoreText: window.__gameSceneForTest.highScoreText.text,
    foodCount: window.__gameSceneForTest.foodCount,
    foodSprites: window.__gameSceneForTest.foods.getChildren().length,
    antSprites: window.__gameSceneForTest.ants.getChildren().length
  }))).toEqual({
    score: 0,
    scoreText: "0",
    highScoreText: "HI 9",
    foodCount: 8,
    foodSprites: 8,
    antSprites: 4
  });
});

test("falling ants raise the score and spawn an extra ant every seventh escape", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);

  await page.goto("/");
  await clickStartOnCanvas(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.__gameSceneForTest))).toBe(true);

  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    for (let index = 0; index < 7; index++) {
      gameScene.antDied(gameScene.ants.getChildren()[0]);
    }
  });

  await expect.poll(() => page.evaluate(() => ({
    score: window.__gameSceneForTest.score,
    scoreText: window.__gameSceneForTest.scoreText.text,
    antSprites: window.__gameSceneForTest.ants.getChildren().length
  }))).toEqual({
    score: 7,
    scoreText: "7",
    antSprites: 5
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
  await expect.poll(() => page.evaluate(() => Boolean(window.__gameSceneForTest))).toBe(true);

  await page.evaluate(() => {
    const gameScene = window.__gameSceneForTest;
    gameScene.score = 4;
    gameScene.scoreText.setText("4");
    const food = gameScene.foods.getChildren()[0];
    gameScene.destroyFood(food);
    food.disableBody(false, true);
  });

  await expect.poll(() => page.evaluate(() => ({
    foodCount: window.__gameSceneForTest.foodCount,
    gameOver: Boolean(window.__gameSceneForTest.gameOver),
    highScore: localStorage.getItem("highScore")
  }))).toEqual({
    foodCount: 7,
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

  await expect.poll(() => page.evaluate(() => ({
    gameOver: window.__gameSceneForTest.gameOver,
    foodCount: window.__gameSceneForTest.foodCount,
    highScore: localStorage.getItem("highScore")
  }))).toEqual({
    gameOver: true,
    foodCount: 0,
    highScore: "4"
  });
});

test("arrow keys set tray gravity while the score HUD stays untilted", async ({ page }) => {
  await stubFullscreenAndExposeScenes(page);

  await page.goto("/");
  await clickStartOnCanvas(page);
  const tiltedBoard = page.locator("#tilting-board");
  const stationaryHud = page.locator("#stationary-hud");
  await expect(tiltedBoard).toBeVisible();

  await page.keyboard.down("ArrowLeft");
  try {
    await expect.poll(() => page.evaluate(() => ({
      x: window.__gameSceneForTest.gravity.x,
      y: window.__gameSceneForTest.gravity.y
    }))).toEqual({ x: -30, y: 0 });
    await expect
      .poll(() => tiltedBoard.evaluate((element) => element.style.transform))
      .toBe("rotateX(0deg) rotateY(-10deg)");
    await expect(stationaryHud).toHaveCSS("transform", "none");
  } finally {
    await page.keyboard.up("ArrowLeft");
  }
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
    const canvas = page.locator("#game canvas").first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
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
