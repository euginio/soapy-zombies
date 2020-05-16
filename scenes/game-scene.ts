/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Ants Feast: Game Scene
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
  highScoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: any = {};
  
  foodCount: number;
  initialAnts: number = 4
  initialFood: number = 8;
  zombieRate: number = 7;
  accelerometerFactor: number = 2

  gravityNum = { x: 30, y: 30 };
  tray: Phaser.GameObjects.Image;
  currentHighScore: number = 0;

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
    super.init()
    this.score = 0;
  }

  antDied(outAnt: Ant) {
    this.score++;
    this.scoreText.setText(this.score.toString());
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
    if(this.score>this.currentHighScore){
      localStorage.setItem('highScore',this.score.toString())
    }
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

    let divider = 4
    let antFrames = [...Array(Math.floor(62/divider)).keys()].map(e=>e*divider)//using just 20 frames
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('ant_sheet',{frames:antFrames}),
      // frames: this.anims.generateFrameNumbers('ant_sheet',{start:0,end:61}),
      duration: 150,
      // frameRate: 800,
      repeat: -1
    });

    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();

    let grass = this.add.image(this.width / 2, this.height / 2, 'grass');
    grass.setScale(2.3)
    this.tray = this.add.image(this.width / 2, this.height / 2, 'tray');
    this.tray.setSize(this.tray.width-20,this.tray.height-3)
    this.tray.setScale(1.6)
    
    this.scoreText = this.add.text(14, 13, '0', { fontSize: '22px', fontStyle: 'bold', fill: '#313' });
    // this.scoreText.setVisible(false);
    this.currentHighScore = parseInt(localStorage.getItem('highScore'))||0;
    this.highScoreText = this.add.text(14, 43, 'HI ' + this.currentHighScore, { fontSize: '15px', fontStyle: 'bold', fill: '#201' });

    this.foods = this.add.group();
    this.foods.runChildUpdate = true;
    this.physics.add.collider(this.foods, this.foods, this.repositionFood, null, this);
    for (let index = 0; index < this.foodCount; index++) {
      let newF= new Food(this)
      this.foods.add(newF, true)
    }

    this.ants = this.add.group();
    this.ants.runChildUpdate = true;
    for (let i = 0; i < this.initialAnts; i++) {
      this.addNewAnt()
    }

    this.physics.add.collider(this.ants, this.foods, this.eatFood, null, this);
    this.physics.add.collider(this.ants, this.ants, null, null, this);
    // this.physics.add.overlap(this.ants, this.tray, this.antOut, null, this);
    // this.ants.children.iterate((z:Ant)=>z.init())
    if (!this.sys.game.device.os.desktop) {
      window.addEventListener("devicemotion", function (event: DeviceMotionEvent) {
        self.gravity.y = event.accelerationIncludingGravity.x * self.accelerometerFactor;
        self.gravity.x = event.accelerationIncludingGravity.y * self.accelerometerFactor;
        self.gravity.z = event.accelerationIncludingGravity.z;
      }, false);
    }
  }

  repositionFood(food: Food, food2: Food) {
    food.placeInTray()
  }

  // antOut(ant: Ant, tray: Phaser.Physics.Arcade.Sprite) {
  //   ant.outOfTray()
  // }

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

    // debug angles
    // let ant:Ant = <Ant>this.ants.getChildren()[0];
    // this.scoreText.setText(`angulo: ${ant.body.angle},${ant.body.facing},${ant.angle}`);

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
