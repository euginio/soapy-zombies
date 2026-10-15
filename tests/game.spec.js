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
  const canvas = page.locator("#game canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => [...loadedAssets]).toHaveLength(requiredAssets.length);

  const titleScreen = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect
    .poll(async () => Buffer.compare(titleScreen, await canvas.screenshot()))
    .not.toBe(0);

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
  const canvas = page.locator("#game canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => [...loadedAssets]).toHaveLength(requiredAssets.length);

  const titleScreen = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect
    .poll(async () => Buffer.compare(titleScreen, await canvas.screenshot()))
    .not.toBe(0);

  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("desktop controls can score an escaping ant", async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });

  await page.goto("/");
  const canvas = page.locator("#game canvas");
  await expect(canvas).toBeVisible();
  const titleScreen = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.75);
  await expect
    .poll(async () => Buffer.compare(titleScreen, await canvas.screenshot()))
    .not.toBe(0);

  const scoreRegion = {
    x: Math.round(bounds.x + 5),
    y: Math.round(bounds.y + 5),
    width: 80,
    height: 45
  };
  const initialScore = await page.screenshot({ clip: scoreRegion });
  await page.keyboard.down("ArrowRight");
  try {
    await expect
      .poll(async () => Buffer.compare(initialScore, await page.screenshot({ clip: scoreRegion })), {
        timeout: 12_000
      })
      .not.toBe(0);
  } finally {
    await page.keyboard.up("ArrowRight");
  }
});
