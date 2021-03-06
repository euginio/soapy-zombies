/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Ants Feast
 * @license      
 */

import "phaser";
import { BootScene } from "./scenes/boot-scene";
import { GameScene } from "./scenes/game-scene";
import { TitleScene } from "./scenes/title-scene";

const config: Phaser.Types.Core.GameConfig = {
  title: "Ants Feast",
  url: "https://github.com/euginio/picnic-ants",
  version: "1.0",
  width: 580,
  height: 300,
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      // gravity: { y: 0, x: 0 }
    }
  },
  parent: "game",
  scene: [BootScene, TitleScene, GameScene],
  // backgroundColor: "#de3412",
  // render: { pixelArt: false, antialias: true }
};

export class Game extends Phaser.Game {
  constructor(config: Phaser.Types.Core.GameConfig) {
    super(config);
  }
}

window.addEventListener("load", () => {
  var game = new Game(config);
});
