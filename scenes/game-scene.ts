/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Ants Feast: Game Scene
 * @license      
 */

import { ANT_DEBUG_COLORS, DEBUG_MODE } from "../const/const";
import {
  calculateDeviceTilt,
  isNewHighScore,
  isTabletDevice,
  resolveAntEscape,
  resolveFoodLoss
} from "../game-rules";
import { Ant } from "../objects/ant";
import { Food } from "../objects/food";
import { MyScene } from "./my-scene";

export class GameScene extends MyScene {
  private static readonly maxVisualTilt = 10;
  private boardLayer: HTMLDivElement;
  private boardCanvas: HTMLCanvasElement;
  private boardContext: CanvasRenderingContext2D;
  private antTintCanvas: HTMLCanvasElement;
  private antTintContext: CanvasRenderingContext2D;
  private hudCanvas: HTMLCanvasElement;
  private hudContext: CanvasRenderingContext2D;
  private visualLayerParent: HTMLElement;
  private readonly visualLayerParentPositions = new Map<HTMLElement, string>();
  private deviceOrientationHandler: (event: DeviceOrientationEvent) => void;
  private deviceMotionHandler: (event: DeviceMotionEvent) => void;
  private sensorRecenterButton: HTMLButtonElement | null = null;
  private latestOrientation: { beta: number; gamma: number } | null = null;
  private sensorBaseline: { beta: number; gamma: number } | null = null;
  private deviceTilt: { x: number; y: number } | null = null;
  ants: Phaser.GameObjects.Group;
  foods: Phaser.GameObjects.Group;
  gameOver: any;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  highScoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  
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
    super.init();
    this.score = 0;
    this.gameOver = false;
  }

  antDied(outAnt: Ant) {
    if (this.gameOver) {
      return;
    }
    const outcome = resolveAntEscape(this.score, this.zombieRate);
    this.score = outcome.score;
    this.scoreText.setText(this.score.toString());
    if (outcome.spawnAnt) {
      this.addNewAnt();
    }
  }

  foodOut(food: Food) {
    food.destroy();
  }

  destroyFood(food: Food) {
    if (this.gameOver) {
      return;
    }
    const outcome = resolveFoodLoss(this.foodCount);
    this.foodCount = outcome.foodCount;
    if (outcome.gameOver) {
      this.overGame();
    }
  }

  overGame() {
    if (this.gameOver) {
      return;
    }
    this.gameOver = true;
    if (isNewHighScore(this.score, this.currentHighScore)) {
      this.currentHighScore = this.score;
      localStorage.setItem('highScore', this.score.toString());
    }
    this.anims.pauseAll();
    this.physics.pause();

    this.time.delayedCall(4000, () => {
      this.restart();
    });
  }

  restart() {
    this.scene.restart();
  }

  create(): void {
    this.physics.resume();
    this.anims.resumeAll();
    this.gameOver = false;
    this.foodCount = this.initialFood;
    const canvas = this.game.canvas;
    this.createVisualLayers(canvas);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.renderVisualLayers, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyVisualLayers, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeMotionListeners, this);
    this.sensorBaseline = null;
    this.deviceTilt = null;
    this.latestOrientation = null;
    if (this.isTablet()) {
      this.createSensorRecenterButton();
    }

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
    this.deviceMotionHandler = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (this.deviceTilt) {
        return;
      }
      if (!acceleration) {
        return;
      }
      this.gravity.y = acceleration.x * this.accelerometerFactor;
      this.gravity.x = acceleration.y * this.accelerometerFactor;
      this.gravity.z = acceleration.z;
    };
    this.deviceOrientationHandler = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) {
        return;
      }
      this.latestOrientation = { beta: event.beta, gamma: event.gamma };
      if (this.sensorRecenterButton) {
        this.sensorRecenterButton.style.display = "block";
      }
      if (!this.sensorBaseline) {
        this.sensorBaseline = { beta: event.beta, gamma: event.gamma };
        this.deviceTilt = { x: 0, y: 0 };
        this.gravity.x = 0;
        this.gravity.y = 0;
        return;
      }

      const screenAngle = screen.orientation?.angle ?? 0;
      this.deviceTilt = calculateDeviceTilt(
        event.beta,
        event.gamma,
        this.sensorBaseline.beta,
        this.sensorBaseline.gamma,
        screenAngle
      );
      this.gravity.x = this.deviceTilt.x * this.gravityNum.x;
      this.gravity.y = this.deviceTilt.y * this.gravityNum.y;
    };
    window.addEventListener("devicemotion", this.deviceMotionHandler);
    window.addEventListener("deviceorientation", this.deviceOrientationHandler);
  }

  repositionFood(food: Food, food2: Food) {
    food.placeInTray()
  }

  // antOut(ant: Ant, tray: Phaser.Physics.Arcade.Sprite) {
  //   ant.outOfTray()
  // }

  addNewAnt() {
    const ant = new Ant(this);
    if (DEBUG_MODE) {
      const usedColors = new Set(
        this.ants.getChildren()
          .filter((child): child is Ant => child instanceof Ant)
          .map((existingAnt) => existingAnt.debugColor)
      );
      const availableColors = ANT_DEBUG_COLORS.filter((color) => !usedColors.has(color));
      ant.debugColor = Phaser.Utils.Array.GetRandom(
        availableColors.length > 0 ? availableColors : ANT_DEBUG_COLORS
      );
    }
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

    if (this.sys.game.device.os.desktop && !this.deviceTilt) {
      this.checkCursors();
      this.applyBoardTilt(this.gravity.x, this.gravity.y);
    } else if (this.deviceTilt) {
      this.applyVisualTilt(
        this.deviceTilt.x * GameScene.maxVisualTilt,
        this.deviceTilt.y * GameScene.maxVisualTilt
      );
    } else {
      this.applyBoardTilt(this.gravity.x, this.gravity.y);
    }
  }

  private applyBoardTilt(gravityX: number, gravityY: number) {
    const tiltX = Phaser.Math.Clamp(gravityX / this.gravityNum.x, -1, 1)
      * GameScene.maxVisualTilt;
    const tiltY = Phaser.Math.Clamp(gravityY / this.gravityNum.y, -1, 1)
      * GameScene.maxVisualTilt;

    this.applyVisualTilt(tiltX, tiltY);
  }

  private applyVisualTilt(tiltX: number, tiltY: number) {
    this.boardCanvas.style.transform = `rotateX(${-tiltY}deg) rotateY(${tiltX}deg)`;
  }

  private recenterDeviceTilt() {
    if (!this.latestOrientation) {
      return;
    }

    this.sensorBaseline = { ...this.latestOrientation };
    this.deviceTilt = { x: 0, y: 0 };
    this.gravity.x = 0;
    this.gravity.y = 0;
  }

  private isTablet(): boolean {
    const userAgentData = (navigator as Navigator & {
      userAgentData?: { mobile: boolean; platform: string };
    }).userAgentData;
    return isTabletDevice(
      userAgentData?.mobile,
      userAgentData?.platform ?? navigator.platform,
      navigator.userAgent,
      navigator.maxTouchPoints,
      screen.width,
      screen.height
    );
  }

  private createSensorRecenterButton() {
    this.sensorRecenterButton = document.createElement("button");
    this.sensorRecenterButton.id = "recenter-device-tilt";
    this.sensorRecenterButton.type = "button";
    this.sensorRecenterButton.textContent = "Re-center";
    this.sensorRecenterButton.setAttribute("aria-label", "Re-center tray tilt");
    Object.assign(this.sensorRecenterButton.style, {
      position: "absolute",
      top: "8px",
      right: "8px",
      zIndex: "10001",
      display: "none",
      padding: "7px 10px",
      border: "0",
      borderRadius: "4px",
      color: "#201",
      background: "rgba(255, 255, 255, 0.9)",
      font: "bold 14px sans-serif",
      cursor: "pointer",
      pointerEvents: "auto"
    });
    this.sensorRecenterButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.recenterDeviceTilt();
    });
    this.visualLayerParent.appendChild(this.sensorRecenterButton);
  }

  private createVisualLayers(gameCanvas: HTMLCanvasElement) {
    this.visualLayerParent = gameCanvas.parentElement || document.body;
    this.setVisualLayerParent(this.visualLayerParent);

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
    this.antTintCanvas = document.createElement("canvas");
    this.antTintContext = this.antTintCanvas.getContext("2d");
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
    this.setVisualLayerParent(gameCanvas.parentElement || document.body);
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
    if (this.sensorRecenterButton) {
      this.sensorRecenterButton.style.left = `${
        bounds.left - parentBounds.left + this.visualLayerParent.scrollLeft +
        bounds.width - this.sensorRecenterButton.offsetWidth - 8
      }px`;
      this.sensorRecenterButton.style.top = `${
        bounds.top - parentBounds.top + this.visualLayerParent.scrollTop + 8
      }px`;
      this.sensorRecenterButton.style.right = "auto";
    }
  }

  private setVisualLayerParent(parent: HTMLElement) {
    if (!this.visualLayerParentPositions.has(parent)) {
      this.visualLayerParentPositions.set(parent, parent.style.position);
    }
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    this.visualLayerParent = parent;

    for (const layer of [this.boardLayer, this.hudCanvas, this.sensorRecenterButton]) {
      if (layer && layer.parentElement !== parent) {
        parent.appendChild(layer);
      }
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
    const drawX = -object.width * object.originX;
    const drawY = -object.height * object.originY;
    if (DEBUG_MODE && object instanceof Ant && object.debugColor) {
      if (this.antTintCanvas.width !== frame.cutWidth || this.antTintCanvas.height !== frame.cutHeight) {
        this.antTintCanvas.width = frame.cutWidth;
        this.antTintCanvas.height = frame.cutHeight;
      }
      this.antTintContext.clearRect(0, 0, frame.cutWidth, frame.cutHeight);
      this.antTintContext.drawImage(
        image,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        0,
        0,
        frame.cutWidth,
        frame.cutHeight
      );
      this.antTintContext.globalCompositeOperation = "source-atop";
      this.antTintContext.fillStyle = object.debugColor;
      this.antTintContext.fillRect(0, 0, frame.cutWidth, frame.cutHeight);
      this.antTintContext.globalCompositeOperation = "source-over";
      context.drawImage(this.antTintCanvas, drawX, drawY, object.width, object.height);
    } else {
      context.drawImage(
        image,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        drawX,
        drawY,
        object.width,
        object.height
      );
    }
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
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.renderVisualLayers, this);
    this.boardLayer?.remove();
    this.hudCanvas?.remove();
    this.sensorRecenterButton?.remove();
    this.sensorRecenterButton = null;
    for (const [parent, originalPosition] of this.visualLayerParentPositions) {
      parent.style.position = originalPosition;
    }
    this.visualLayerParentPositions.clear();
  }

  private removeMotionListeners() {
    if (this.deviceMotionHandler) {
      window.removeEventListener("devicemotion", this.deviceMotionHandler);
      this.deviceMotionHandler = null;
    }
    if (this.deviceOrientationHandler) {
      window.removeEventListener("deviceorientation", this.deviceOrientationHandler);
      this.deviceOrientationHandler = null;
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
