var path = require("path");
var phaser = path.resolve(__dirname, "node_modules/phaser/dist/phaser.js");

module.exports = {
  entry: "./game.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js"
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: { configFile: "tsconfig.webpack.json" }
      }
    ]
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, "./")
    },
    devMiddleware: {
      publicPath: "/dist/"
    },
    host: "127.0.0.1",
    port: 8080,
    open: true
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      phaser: phaser
    }
  }
};
