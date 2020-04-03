/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Soapy zombies: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { Zombie } from "../objects/zombie";

export class GameScene extends Phaser.Scene {
  brain: Phaser.Physics.Arcade.Sprite;
  theZombie: Phaser.Physics.Arcade.Sprite;
  zombies: Phaser.GameObjects.Group;

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
    // Init variables
    // this.canMove = true;

    // set background color
    // this.cameras.main.setBackgroundColor(0x78aade);

    // Init grid with tiles

    // Input
    // this.input.on("gameobjectdown", this.tileDown, this);

    // Check if matches on the start
    // this.checkMatches();
  }

  create(): void {
    this.anims.create({
      key: 'camina',
      frames: this.anims.generateFrameNumbers('zombie_sheet', { frames: [ 0, 6, 12, 1, 7, 13 ] }),
      frameRate: 7,
      repeat: -1
    });

    this.brain= this.physics.add.sprite(<number>this.game.config.width/2,<number>this.game.config.height/2, 'brain')
    
    this.zombies = this.add.group();
    // first zombie
    this.theZombie = Zombie.newRandomZombie(this);
    this.zombies.add(this.theZombie)
    
    // this.zombies.children.iterate((z:Zombie)=>z.init())    
  }
  
  update(): void {
    this.physics.moveToObject(this.theZombie,this.brain)

  }
  
}
