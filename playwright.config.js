const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true
  },
  webServer: [
    {
      command: "node tests/serve.cjs",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 10_000
    },
    {
      command:
        "npm exec -- vite --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174/dev.html",
      reuseExistingServer: !process.env.CI,
      timeout: 10_000
    }
  ]
});
