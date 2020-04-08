/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Picnic ants: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { Ant } from "../objects/ant";
import { Food } from "../objects/food";

export class GameScene extends Phaser.Scene {
  // food: Phaser.Physics.Arcade.Sprite;
  ants: Phaser.GameObjects.Group;
  foods: Phaser.GameObjects.Group;
  gameOver: any;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: any = {};
  width: number;
  height: number;
  foodCount: number;
  initialAnts: number = 2
  initialFood: number = 6;

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

  foodOut(food:Food) {
    food.destroy()
  }

  destroyFood(food:Food) {
    this.foodCount--
    if(this.foodCount==0){
      this.overGame()
    }
  }
  
  overGame(){
    this.score = 0;
    this.gameOver = true

    this.anims.pauseAll()
    this.physics.pause();
    
    this.time.delayedCall(5000, () => {
      this.scene.restart()
      this.foods.children.iterate((f:Food)=>f.body.setEnable(true))
      this.physics.resume();
      this.anims.resumeAll();
      this.gameOver=false
    })
  }

  create(): void {
    let self = this;

    this.foodCount=this.initialFood;
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
      key: 'eatingFood',
      frames: this.anims.generateFrameNumbers('food', {}),
      frameRate: 4,
      repeat: 0,
      duration:3000
    });
    
    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();
    
    let background = this.add.image(this.width/2,this.height/2,'graveyard');
    background.setScale(.25)
    this.scoreText = this.add.text(16, 16, 'hormigas muertas: 0', { fontSize: '23px', fontStyle: 'bold', fill: '#DD3' });

    this.foods=this.add.group();
    this.foods.runChildUpdate=true;
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

    this.physics.add.overlap(this.ants, this.foods, this.eatFood, null, this);
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

  eatFood(ant: Phaser.Physics.Arcade.Sprite, food: Phaser.Physics.Arcade.Sprite) {
    if (food.body.enable){
      food.play('eatingFood');
    }
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
