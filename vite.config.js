const path = require("node:path");
const { defineConfig } = require("vite");

module.exports = defineConfig({
  base: "./",
  server: {
    port: Number(process.env.PLAYWRIGHT_DEV_PORT || 5173)
  },
  build: {
    emptyOutDir: true,
    license: {
      fileName: "bundle.js.LICENSE.txt"
    },
    lib: {
      entry: path.resolve(__dirname, "game.ts"),
      name: "AntsFeast",
      formats: ["iife"],
      fileName: () => "bundle.js"
    },
    outDir: path.resolve(__dirname, "dist")
  }
});
