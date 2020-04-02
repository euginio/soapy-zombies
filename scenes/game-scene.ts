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
  zombies: Phaser.Physics.Arcade.Group;

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
    this.brain= this.physics.add.sprite(<number>this.game.config.width/2,<number>this.game.config.height/2, 'brain')
    
    this.zombies = this.physics.add.group();

    // let zomb=this.zombies.create(16, 16, 'zombie-sheet',);
    // zomb = Object.assign(new Zombie(this), zomb);
    // zomb.setBounce(1);
    // zomb.setCollideWorldBounds(true);
    // zomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
    // zomb.allowGravity = false;

    // first zombie
    let a = Zombie.newRandomZombie(this);
    this.zombies.add(a)
    a.init();

    // this.zombies.children.iterate((z:Zombie)=>z.init())
    // this.theZombie = this.physics.add.sprite(40,40, 'zombie_sheet')
  }

  update(): void {

  }
  
}
