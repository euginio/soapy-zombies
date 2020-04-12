/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Picnic ants: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { Ant } from "../objects/ant";
import { Food } from "../objects/food";
import { MyScene } from "./my-scene";

export class GameScene extends MyScene {
  ants: Phaser.GameObjects.Group;
  foods: Phaser.GameObjects.Group;
  gameOver: any;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: any = {};
  
  foodCount: number;
  initialAnts: number = 2
  initialFood: number = 6;

  gravityNum = { x: 30, y: 30 };
  zombieRate: number = 7;

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
    super.init()
    this.score = 0;
  }

  antOut(outAnt: Ant) {
    this.score++;
    this.scoreText.setText('hormigas muertas: ' + this.score);
    if (this.score % this.zombieRate == 0) {
      this.addNewAnt()
    }
  }

  foodOut(food: Food) {
    food.destroy()
  }

  destroyFood(food: Food) {
    this.foodCount--
    if (this.foodCount == 0) {
      this.overGame()
    }
  }

  overGame() {
    this.anims.pauseAll()
    this.physics.pause();
    this.gameOver = true

    this.time.delayedCall(4000, () => {
      this.restart();
    })
  }

  restart() {
    this.scene.restart()
    this.foods.children.iterate((f: Food) => f.body.setEnable(true))
    this.physics.resume();
    this.anims.resumeAll();
    this.gameOver = false
  }

  create(): void {
    let self = this;

    this.foodCount = this.initialFood;

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
      frames: this.anims.generateFrameNumbers('ant_sheet', { frames: [5, 11, 17] }),
      frameRate: 4,
      repeat: -1
    });

    this.anims.create({
      key: 'eatingFood',
      frames: this.anims.generateFrameNumbers('food', {}),
      // frameRate: 4,
      // repeat:0,
      duration: 1500,
      hideOnComplete: true
    });

    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();

    let background = this.add.image(this.width / 2, this.height / 2, 'graveyard');
    background.setScale(.3)
    this.scoreText = this.add.text(16, 16, 'hormigas muertas: 0', { fontSize: '19px', fontStyle: 'bold', fill: '#DD3' });

    this.foods = this.add.group();
    this.foods.runChildUpdate = true;
    for (let index = 0; index < this.foodCount; index++) {
      this.foods.add(new Food(this), true)
    }

    // this.tweens.add({targets:this.food, 
    //   scale: { value: .7, duration: 300, ease: 'Power1' },
    //   yoyo:true, loop:-1 })

    this.ants = this.add.group();
    this.ants.runChildUpdate = true;
    for (let i = 0; i < this.initialAnts; i++) {
      this.addNewAnt()
    }

    this.physics.add.collider(this.ants, this.foods, this.eatFood, null, this);
    this.physics.add.collider(this.ants, this.ants, null, null, this);
    this.physics.add.collider(this.foods, this.foods, null, null, this);
    // this.ants.children.iterate((z:Ant)=>z.init())
    if (!this.sys.game.device.os.desktop) {
      window.addEventListener("devicemotion", function (event: DeviceMotionEvent) {
        self.gravity.y = event.accelerationIncludingGravity.x;
        self.gravity.x = event.accelerationIncludingGravity.y;
        self.gravity.z = event.accelerationIncludingGravity.z;
      }, false);
    }
  }

  addNewAnt() {
    this.ants.add(new Ant(this), true)
  }

  eatFood(ant: Ant, food: Food) {
    food.beingEat();
    // ant.eating()
  }

  update(): void {
    if (this.gameOver) {
      return;
    }

    if (this.sys.game.device.os.desktop) {
      this.checkCursors();
    }
  }

  checkCursors() {
    if (this.cursors.left.isDown) {
      this.gravity.x = -this.gravityNum.x
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(-20));
    }
    else if (this.cursors.right.isDown) {
      this.gravity.x = this.gravityNum.x
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(20));
    }
    else {
      this.gravity.x = 0
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityX(0));
    }

    if (this.cursors.up.isDown) {
      this.gravity.y = -this.gravityNum.y
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(-20));
    }
    else if (this.cursors.down.isDown) {
      this.gravity.y = this.gravityNum.y
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(20));
    }
    else {
      this.gravity.y = 0
      // this.ants.children.iterate((zb:Ant)=> zb.setGravityY(0));
    }

  }

}
