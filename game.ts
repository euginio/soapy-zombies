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
  render: {
    transparent: true
  },
  input: {
    mouse: true,
    touch: true
  },
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
  // Phaser starts with BootScene, then scenes transition to the title and gameplay.
  scene: [BootScene, TitleScene, GameScene],
  // backgroundColor: "#de3412",
  // render: { pixelArt: false, antialias: true }
};

export class Game extends Phaser.Game {
  constructor(config: Phaser.Types.Core.GameConfig) {
    super(config);
    (window as any).game = this;
  }
}

window.addEventListener("load", () => {
  // Wait until the page is ready before Phaser attaches its canvas to #game.
  new Game(config);
});
