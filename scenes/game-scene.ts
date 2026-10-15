/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Ants Feast: Game Scene
 * @license      
 */

import { CONST } from "../const/const";
import { isNewHighScore, resolveAntEscape, resolveFoodLoss } from "../game-rules";
import { Ant } from "../objects/ant";
import { Food } from "../objects/food";
import { MyScene } from "./my-scene";

export class GameScene extends MyScene {
  private static readonly maxVisualTilt = 10;
  private boardLayer: HTMLDivElement;
  private boardCanvas: HTMLCanvasElement;
  private boardContext: CanvasRenderingContext2D;
  private hudCanvas: HTMLCanvasElement;
  private hudContext: CanvasRenderingContext2D;
  private visualLayerParent: HTMLElement;
  private originalParentPosition: string;
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
    const outcome = resolveAntEscape(this.score, this.zombieRate);
    this.score = outcome.score;
    this.scoreText.setText(this.score.toString());
    if (outcome.spawnAnt) {
      this.addNewAnt()
    }
  }

  foodOut(food: Food) {
    food.destroy()
  }

  destroyFood(food: Food) {
    const outcome = resolveFoodLoss(this.foodCount);
    this.foodCount = outcome.foodCount;
    if (outcome.gameOver) {
      this.overGame()
    }
  }

  overGame() {
    if(isNewHighScore(this.score, this.currentHighScore)){
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
    this.foods.children.iterate((child) => {
      if (child instanceof Food) {
        child.body.setEnable(true)
      }
      return true
    })
    this.physics.resume();
    this.anims.resumeAll();
    this.gameOver = false
  }

  create(): void {
    let self = this;

    this.foodCount = this.initialFood;
    const canvas = this.game.canvas;
    this.createVisualLayers(canvas);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.renderVisualLayers, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyVisualLayers, this);

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
    this.tray.setVisible(false);
    
    this.scoreText = this.add.text(14, 13, '0', { fontSize: '22px', fontStyle: 'bold', color: '#313' });
    this.scoreText.setVisible(false);
    this.currentHighScore = parseInt(localStorage.getItem('highScore'))||0;
    this.highScoreText = this.add.text(14, 43, 'HI ' + this.currentHighScore, { fontSize: '15px', fontStyle: 'bold', color: '#201' });
    this.highScoreText.setVisible(false);

    this.foods = this.add.group();
    this.foods.runChildUpdate = true;
    this.physics.add.collider(this.foods, this.foods, this.repositionFood, null, this);
    for (let index = 0; index < this.foodCount; index++) {
      let newF= new Food(this)
      this.foods.add(newF, true)
      newF.setVisible(false);
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
    const ant = new Ant(this);
    ant.setVisible(false);
    this.ants.add(ant, true);
  }

  eatFood(ant: Ant, food: Food) {
    food.beingEat();
    // ant.eating()
  }

  update(): void {
    if (this.gameOver) {
      this.applyBoardTilt(0, 0);
      return;
    }

    // debug angles
    // let ant:Ant = <Ant>this.ants.getChildren()[0];
    // this.scoreText.setText(`angulo: ${ant.body.angle},${ant.body.facing},${ant.angle}`);

    if (this.sys.game.device.os.desktop) {
      this.checkCursors();
    }
    this.applyBoardTilt(this.gravity.x, this.gravity.y);
  }

  private applyBoardTilt(gravityX: number, gravityY: number) {
    const tiltX = Phaser.Math.Clamp(gravityX / this.gravityNum.x, -1, 1)
      * GameScene.maxVisualTilt;
    const tiltY = Phaser.Math.Clamp(gravityY / this.gravityNum.y, -1, 1)
      * GameScene.maxVisualTilt;

    this.boardCanvas.style.transform = `rotateX(${-tiltY}deg) rotateY(${tiltX}deg)`;
  }

  private createVisualLayers(gameCanvas: HTMLCanvasElement) {
    this.visualLayerParent = gameCanvas.parentElement || document.body;
    this.originalParentPosition = this.visualLayerParent.style.position;
    if (getComputedStyle(this.visualLayerParent).position === "static") {
      this.visualLayerParent.style.position = "relative";
    }

    this.boardLayer = document.createElement("div");
    this.boardLayer.id = "tilting-board-layer";
    Object.assign(this.boardLayer.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "10",
      perspective: "900px",
      perspectiveOrigin: "center center"
    });

    this.boardCanvas = document.createElement("canvas");
    this.boardCanvas.id = "tilting-board";
    this.boardCanvas.width = gameCanvas.width;
    this.boardCanvas.height = gameCanvas.height;
    Object.assign(this.boardCanvas.style, {
      display: "block",
      width: "100%",
      height: "100%",
      transformOrigin: "center center",
      transition: "transform 120ms ease-out"
    });
    this.boardContext = this.boardCanvas.getContext("2d");
    this.boardLayer.appendChild(this.boardCanvas);
    this.visualLayerParent.appendChild(this.boardLayer);

    this.hudCanvas = document.createElement("canvas");
    this.hudCanvas.id = "stationary-hud";
    this.hudCanvas.width = gameCanvas.width;
    this.hudCanvas.height = gameCanvas.height;
    Object.assign(this.hudCanvas.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "11"
    });
    this.hudContext = this.hudCanvas.getContext("2d");
    this.visualLayerParent.appendChild(this.hudCanvas);
    this.syncVisualLayerBounds(gameCanvas);
  }

  private syncVisualLayerBounds(gameCanvas: HTMLCanvasElement) {
    const bounds = gameCanvas.getBoundingClientRect();
    const parentBounds = this.visualLayerParent.getBoundingClientRect();
    for (const layer of [this.boardLayer, this.hudCanvas]) {
      Object.assign(layer.style, {
        left: `${bounds.left - parentBounds.left + this.visualLayerParent.scrollLeft}px`,
        top: `${bounds.top - parentBounds.top + this.visualLayerParent.scrollTop}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`
      });
    }
  }

  private renderVisualLayers() {
    const gameCanvas = this.game.canvas;
    this.syncVisualLayerBounds(gameCanvas);

    const scaleX = this.boardCanvas.width / this.width;
    const scaleY = this.boardCanvas.height / this.height;
    this.boardContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    this.boardContext.clearRect(0, 0, this.width, this.height);

    this.drawBoardObject(this.tray);
    this.foods.children.iterate((child) => {
      if (child instanceof Food) {
        this.drawBoardObject(child);
      }
      return true;
    });
    this.ants.children.iterate((child) => {
      if (child instanceof Ant) {
        this.drawBoardObject(child);
      }
      return true;
    });

    this.hudContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    this.hudContext.clearRect(0, 0, this.width, this.height);
    this.drawHudText(this.scoreText);
    this.drawHudText(this.highScoreText);
  }

  private drawBoardObject(object: Phaser.GameObjects.Image | Ant | Food) {
    if (!object.active || object.alpha === 0) {
      return;
    }

    const frame = object.frame;
    const image = frame.source.image;
    if (image instanceof Uint8Array) {
      return;
    }

    const context = this.boardContext;
    context.save();
    context.globalAlpha = object.alpha;
    context.translate(object.x, object.y);
    context.rotate(object.rotation);
    context.scale(object.scaleX, object.scaleY);
    context.drawImage(
      image,
      frame.cutX,
      frame.cutY,
      frame.cutWidth,
      frame.cutHeight,
      -object.width * object.originX,
      -object.height * object.originY,
      object.width,
      object.height
    );
    context.restore();
  }

  private drawHudText(text: Phaser.GameObjects.Text) {
    const style = text.style;
    this.hudContext.save();
    this.hudContext.font = `${style.fontStyle || "normal"} ${style.fontSize}px ${style.fontFamily}`;
    this.hudContext.fillStyle = style.color;
    this.hudContext.textBaseline = "top";
    this.hudContext.fillText(text.text, text.x, text.y);
    this.hudContext.restore();
  }

  private destroyVisualLayers() {
    this.boardLayer?.remove();
    this.hudCanvas?.remove();
    if (this.originalParentPosition !== undefined) {
      this.visualLayerParent.style.position = this.originalParentPosition;
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
