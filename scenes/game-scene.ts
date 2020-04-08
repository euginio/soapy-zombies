/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Picnic ants: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { Ant } from "../objects/ant";

export class GameScene extends Phaser.Scene {

  apple: Phaser.Physics.Arcade.Sprite;
  ants: Phaser.GameObjects.Group;
  gameOver: any;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: any = {};
  width: number;
  height: number;
  

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
  }

  antOut(outAnt: Ant) {
    outAnt.initAnt()
    this.score++;
    this.scoreText.setText('hormigas muertas: ' + this.score);
    if (this.score % 5 == 0) {
      this.addNewAnt()
    }
  }

  create(): void {
    let self = this;

    // @ts-ignore
    // ScreenOrientation.lock("portrait")
    this.game.scale.orientation = "portrait"

    this.width = <number>this.game.config.width
    this.height = <number>this.game.config.height

    this.input.on('pointerup', function (pointer) {
      if (!self.scale.isFullscreen) {
        self.scale.startFullscreen();
      }
    });

    this.anims.create({
      key: 'walk_down',
      frames: this.anims.generateFrameNumbers('ant_sheet', { frames: [0, 6, 12, 1, 7, 13] }),
      frameRate: 4,
      repeat: -1
    });

    this.anims.create({
      key: 'walk_up',
      frames: this.anims.generateFrameNumbers('ant_sheet', { frames: [2, 8, 3, 9] }),
      frameRate: 4,
      repeat: -1
    });

    this.anims.create({
      key: 'walk_left',
      frames: this.anims.generateFrameNumbers('ant_sheet', { frames: [4, 10, 16] }),
      frameRate: 4,
      repeat: -1
    });

    this.anims.create({
      key: 'walk_right',
      frames: this.anims.generateFrameNumbers('ant_sheet', { frames: [5,11,17] }),
      frameRate: 4,
      repeat: -1
    });

    this.anims.create({
      key: 'eatingApple',
      frames: this.anims.generateFrameNumbers('apple', {}),
      frameRate: 4,
      repeat: 0
    });

    
    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();
    
    let background = this.add.image(this.width/2,this.height/2,'graveyard');
    background.setScale(.25)
    this.scoreText = this.add.text(16, 16, 'hormigas muertas: 0', { fontSize: '23px', fontStyle: 'bold', fill: '#DD3' });

    this.apple = this.physics.add.sprite(<number>this.game.config.width / 2, <number>this.game.config.height / 2, 'apple')
    this.apple.body.immovable = true;
    this.apple.setScale(0.65);
    // this.apple.setSize(this.apple.width/3, this.apple.height/3)
    // this.apple.setOffset(17)
    this.apple.setCircle(10,23,15)

    this.tweens.add({targets:this.apple, 
      scale: { value: .7, duration: 300, ease: 'Power1' },
      yoyo:true, loop:-1 })

    this.ants = this.add.group();

    this.ants.runChildUpdate = true;
    this.addNewAnt()
    this.addNewAnt()
    this.addNewAnt()

    this.physics.add.overlap(this.ants, this.apple, this.eatApple, null, this);
    // this.ants.children.iterate((z:Ant)=>z.init())    
    window.addEventListener("devicemotion", function (event: DeviceMotionEvent) {
      self.gravity.x = -event.accelerationIncludingGravity.x;
      self.gravity.y = event.accelerationIncludingGravity.y;
      self.gravity.z = event.accelerationIncludingGravity.z;
    }, false);

  }

  addNewAnt() {
    this.ants.add(Ant.newRandomAnt(this), true)
  }

  eatApple(ant: Phaser.Physics.Arcade.Sprite, apple: Phaser.Physics.Arcade.Sprite) {
    this.score = 0;
    ant.anims.pause();
    apple.play('eatingApple');
    this.physics.pause();
    this.gameOver = true;
    this.time.delayedCall(5000, () => this.scene.restart())
  }

  update(): void {

    if (this.gameOver) {
      return;
    }

    let gravityNum = { x: 70, y: 70 };

    if (this.cursors.left.isDown) {
      this.gravity.x = -gravityNum.x
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(-20));
    }
    else if (this.cursors.right.isDown) {
      this.gravity.x = gravityNum.x
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(20));
    }
    else {
      this.gravity.x = 0
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(0));
    }

    if (this.cursors.up.isDown) {
      this.gravity.y = -gravityNum.y
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(-20));
    }
    else if (this.cursors.down.isDown) {
      this.gravity.y = gravityNum.y
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(20));
    }
    else {
      this.gravity.y = 0
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(0));
    }

  }

}
