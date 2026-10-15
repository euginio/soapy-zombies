const basicSsl = require("@vitejs/plugin-basic-ssl");
const { mergeConfig } = require("vite");
const viteConfig = require("./vite.config");

module.exports = mergeConfig(viteConfig, {
  plugins: [basicSsl()]
});
