/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies
 * @license      
 */

import "phaser";
import { BootScene } from "./scenes/boot-scene";
import { GameScene } from "./scenes/game-scene";

const config: Phaser.Types.Core.GameConfig = {
  title: "Soapy zombies",
  url: "https://github.com/euginio/soapy-zombies",
  version: "1.0",
  width: 900,
  height: 1600,
  type: Phaser.AUTO,
  parent: "game",
  scene: [BootScene, GameScene],
  backgroundColor: "#de3412",
  render: { pixelArt: false, antialias: true }
};

export class Game extends Phaser.Game {
  constructor(config: Phaser.Types.Core.GameConfig) {
    super(config);
  }
}

window.addEventListener("load", () => {
  var game = new Game(config);
});
