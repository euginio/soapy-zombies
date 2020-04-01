/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Soapy zombies: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { Tile } from "../objects/tile";

export class GameScene extends Phaser.Scene {

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
    // Init variables
    this.canMove = true;

    // set background color
    this.cameras.main.setBackgroundColor(0x78aade);

    // Init grid with tiles

    // Input
    // this.input.on("gameobjectdown", this.tileDown, this);

    // Check if matches on the start
    // this.checkMatches();
  }

  
}
