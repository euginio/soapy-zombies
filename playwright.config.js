const { defineConfig } = require("@playwright/test");

const productionPort = Number(process.env.PLAYWRIGHT_PROD_PORT || 4173);
const developmentPort = Number(process.env.PLAYWRIGHT_DEV_PORT || 4174);
const developmentUrl = `http://127.0.0.1:${developmentPort}/dev.html`;

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  use: {
    baseURL: `http://127.0.0.1:${productionPort}`,
    browserName: "chromium",
    headless: true
  },
  webServer: [
    {
      command: "node tests/serve.cjs",
      url: `http://127.0.0.1:${productionPort}`,
      reuseExistingServer: false,
      timeout: 10_000
    },
    {
      command:
        "npm exec -- vite --host 127.0.0.1 --strictPort",
      url: developmentUrl,
      reuseExistingServer: false,
      timeout: 10_000
    }
  ]
});
