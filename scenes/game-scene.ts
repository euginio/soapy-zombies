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
  zombies: Phaser.GameObjects.Group;
  gameOver: any;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: any = {};

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
  }

  zombieOut(outZombie: Zombie) {
    outZombie.initZombie()
    this.score++;
    this.scoreText.setText('zombies matados: ' + this.score);
    if (this.score % 5 == 0) {
      this.addNewZombie()
    }
  }

  create(): void {
    let self = this;

    // @ts-ignore
    // ScreenOrientation.lock("portrait")
    this.game.scale.orientation = "portrait"

    this.input.on('pointerdown', function (pointer) {
      if (!self.scale.isFullscreen) {
        self.scale.startFullscreen();
      }
    });

    this.anims.create({
      key: 'camina',
      frames: this.anims.generateFrameNumbers('zombie_sheet', { frames: [0, 6, 12, 1, 7, 13] }),
      frameRate: 7,
      repeat: -1
    });

    this.anims.create({
      key: 'eatingBrain',
      frames: this.anims.generateFrameNumbers('brain', {}),
      frameRate: 7,
      repeat: 0
    });

    this.scoreText = this.add.text(16, 16, 'zombies matados: 0', { fontSize: '23px', fill: '#FFF' });

    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();

    this.brain = this.physics.add.sprite(<number>this.game.config.width / 2, <number>this.game.config.height / 2, 'brain')
    this.brain.setScale(0.5);

    this.zombies = this.add.group();

    this.zombies.runChildUpdate = true;
    this.addNewZombie()
    this.addNewZombie()
    this.addNewZombie()

    this.physics.add.collider(this.zombies, this.brain, this.eatBrain, null, this);
    // this.zombies.children.iterate((z:Zombie)=>z.init())    
    window.addEventListener("devicemotion", function (event: DeviceMotionEvent) {
      self.gravity.x = -event.accelerationIncludingGravity.x;
      self.gravity.y = event.accelerationIncludingGravity.y;
      self.gravity.z = event.accelerationIncludingGravity.z;
    }, false);

  }

  addNewZombie() {
    this.zombies.add(Zombie.newRandomZombie(this), true)
  }

  eatBrain(zombie: Phaser.Physics.Arcade.Sprite, brain: Phaser.Physics.Arcade.Sprite) {
    this.score = 0;
    zombie.anims.pause();
    brain.play('eatingBrain');
    this.physics.pause();
    this.gameOver = true;
    this.time.delayedCall(3000, () => this.scene.restart())

  }

  update(): void {

    if (this.gameOver) {
      return;
    }

    let gravityNum = { x: 70, y: 70 };

    if (this.cursors.left.isDown) {
      this.gravity.x = -gravityNum.x
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityX(-20));
    }
    else if (this.cursors.right.isDown) {
      this.gravity.x = gravityNum.x
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityX(20));
    }
    else {
      this.gravity.x = 0
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityX(0));
    }

    if (this.cursors.up.isDown) {
      this.gravity.y = -gravityNum.y
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityY(-20));
    }
    else if (this.cursors.down.isDown) {
      this.gravity.y = gravityNum.y
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityY(20));
    }
    else {
      this.gravity.y = 0
      // this.zombies.children.iterate((zb:Zombie)=> zb.setGravityY(0));
    }

  }

}
