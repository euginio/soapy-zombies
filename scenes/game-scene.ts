/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Ants Feast: Game Scene
 * @license      
 */

import { AUDIO_KEYS, GameAudio } from "../audio/game-audio";
import { ANT_DEBUG_COLORS, DEBUG_MODE } from "../const/const";
import {
  areFoodsOverlapping,
  calculateDeviceMotionTilt,
  calculateDeviceTilt,
  calculateVisualLayerLayout,
  debugColorToTint,
  getScreenOrientationAngle,
  isNewHighScore,
  isTabletDevice,
  parseStoredHighScore,
  resolveAntEscape,
  resolveCaterpillarEscape,
  resolveFoodLoss
} from "../game-rules";
import { Ant } from "../objects/ant";
import { Caterpillar } from "../objects/caterpillar";
import { Food } from "../objects/food";
import { MyScene } from "./my-scene";

export class GameScene extends MyScene {
  private static readonly maxVisualTilt = 10;
  private gameCanvas: HTMLCanvasElement;
  private hudOverlay: HTMLDivElement | null = null;
  private scoreLabel: HTMLDivElement;
  private highScoreLabel: HTMLDivElement;
  private visualLayerParent: HTMLElement;
  private readonly visualLayerParentPositions = new Map<HTMLElement, string>();
  private visualLayerResizeObserver: ResizeObserver | null = null;
  private visualLayerMutationObserver: MutationObserver | null = null;
  private originalScaleUpdateCenter: (() => void) | null = null;
  private visualLayerBoundsDirty = false;
  private readonly invalidateVisualLayerBounds = () => {
    this.visualLayerBoundsDirty = true;
  };
  private deviceOrientationHandler: (event: DeviceOrientationEvent) => void;
  private deviceMotionHandler: (event: DeviceMotionEvent) => void;
  private sensorRecenterButton: HTMLButtonElement | null = null;
  private soundToggleButton: HTMLButtonElement | null = null;
  private audio: GameAudio;
  private stationaryBackground: HTMLDivElement | null = null;
  private gameOverOverlay: HTMLDivElement | null = null;
  private finalScoreValue: HTMLSpanElement;
  private finalHighScoreValue: HTMLSpanElement;
  private latestOrientation: { beta: number; gamma: number } | null = null;
  private sensorBaseline: { beta: number; gamma: number } | null = null;
  private deviceTilt: { x: number; y: number } | null = null;
  private hasMotionInput = false;
  private currentCanvasTransform = "";
  ants: Phaser.GameObjects.Group;
  caterpillars: Phaser.GameObjects.Group;
  initialCaterpillars: number = 1;
  foods: Phaser.GameObjects.Group;
  gameOver = false;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  scoreText: Phaser.GameObjects.Text;
  highScoreText: Phaser.GameObjects.Text;
  score = 0;
  gravity: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  
  foodCount: number;
  initialAnts: number = 4
  initialFood: number = 8;
  zombieRate: number = 7;

  gravityNum = { x: 30, y: 30 };
  tray: Phaser.GameObjects.Image;
  currentHighScore: number = 0;
  private wasdKeys: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  } | null = null;
  private touchDragOrigin: { x: number; y: number } | null = null;
  private touchTilt: { x: number; y: number } | null = null;
  private rotateOverlay: HTMLDivElement | null = null;
  private onWindowPointerUp: (() => void) | null = null;

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
    // Keep scoring and spawn timing in the pure rule module; this scene applies the result.
    const outcome = resolveAntEscape(this.score, this.zombieRate);
    this.score = outcome.score;
    this.scoreText.setText(this.score.toString());
    this.scoreLabel.textContent = this.score.toString();
    this.audio.play(AUDIO_KEYS.antFall);
    if (outcome.spawnAnt) {
      this.addNewAnt();
    }
  }

  destroyFood(food: Food) {
    if (this.gameOver) {
      return;
    }
    const outcome = resolveFoodLoss(this.foodCount);
    this.foodCount = outcome.foodCount;
    if (outcome.gameOver) {
      this.overGame();
    } else {
      this.audio.play(AUDIO_KEYS.foodEaten);
    }
  }

  overGame() {
    if (this.gameOver) {
      return;
    }
    // Set this first so later collisions or updates cannot process the ending twice.
    this.gameOver = true;
    if (isNewHighScore(this.score, this.currentHighScore)) {
      this.currentHighScore = this.score;
      this.saveHighScore(this.currentHighScore);
    }
    this.highScoreLabel.textContent = `HI ${this.currentHighScore}`;
    this.finalScoreValue.textContent = this.score.toString();
    this.finalHighScoreValue.textContent = this.currentHighScore.toString();
    this.gameOverOverlay!.style.display = "flex";
    this.gameOverOverlay!.setAttribute("aria-hidden", "false");
    this.gameOverOverlay!.querySelector("button")?.focus();
    this.anims.pauseAll();
    this.physics.pause();
    this.audio.pauseMusic();
    this.audio.play(AUDIO_KEYS.gameOver);
  }

  private loadHighScore(): number {
    // Storage can throw (private mode, blocked cookies), and the game must still be playable then.
    try {
      return parseStoredHighScore(localStorage.getItem('highScore'));
    } catch (error) {
      console.warn("Could not read the high score from localStorage", error);
      return 0;
    }
  }

  private saveHighScore(highScore: number) {
    try {
      localStorage.setItem('highScore', highScore.toString());
    } catch (error) {
      console.warn("Could not save the high score to localStorage", error);
    }
  }

  restart() {
    this.destroyVisualLayers();
    this.removeMotionListeners();
    this.scene.restart();
  }

  private returnToTitle() {
    this.destroyVisualLayers();
    this.removeMotionListeners();
    this.scene.start("TitleScene");
  }

  create(): void {
    this.physics.resume();
    this.anims.resumeAll();
    this.gameOver = false;
    this.foodCount = this.initialFood;
    this.audio = new GameAudio(this.sound);
    this.audio.restoreMute();
    const canvas = this.game.canvas;
    // These HTML layers stay fixed while only the Phaser canvas receives a tilt transform.
    this.createVisualLayers(canvas);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisualLayerBoundsWhenNeeded, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyVisualLayers, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeMotionListeners, this);
    this.sensorBaseline = null;
    this.deviceTilt = null;
    this.hasMotionInput = false;
    this.latestOrientation = null;
    if (this.isTablet()) {
      this.createSensorRecenterButton();
    }

    if (!this.anims.exists("walk")) {
      const divider = 4;
      const antFrames = [...Array(Math.floor(62 / divider)).keys()].map((index) => index * divider);
      this.anims.create({
        key: "walk",
        frames: this.anims.generateFrameNumbers("ant_sheet", { frames: antFrames }),
        duration: 150,
        repeat: -1
      });
    }

    //  Input Events
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasdKeys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as any;

    // Touch / pointer drag tilt fallback when device motion is unavailable or denied
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver) {
        return;
      }
      if (this.isAnyFoodDragging() || this.tryStartFoodDragAtPointer(pointer)) {
        this.resetTouchTilt();
        return;
      }
      if (this.deviceTilt || this.hasMotionInput) {
        return;
      }
      this.touchDragOrigin = { x: pointer.x, y: pointer.y };
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const draggedFood = this.getDraggedFood();
      if (draggedFood) {
        this.resetTouchTilt();
        if (!pointer.isDown && pointer.buttons === 0) {
          draggedFood.finishDrag(pointer);
          return;
        }
        const px = pointer.x;
        const py = pointer.y;
        draggedFood.moveDrag(px - draggedFood.dragOffsetX, py - draggedFood.dragOffsetY);
        return;
      }
      if (!this.touchDragOrigin || this.gameOver || this.deviceTilt || this.hasMotionInput) {
        return;
      }
      if (!pointer.isDown) {
        this.touchDragOrigin = null;
        return;
      }
      const maxDrag = 50;
      const dx = pointer.x - this.touchDragOrigin.x;
      const dy = pointer.y - this.touchDragOrigin.y;
      this.touchTilt = {
        x: Phaser.Math.Clamp(dx / maxDrag, -1, 1),
        y: Phaser.Math.Clamp(dy / maxDrag, -1, 1)
      };
      this.gravity.x = this.touchTilt.x * this.gravityNum.x;
      this.gravity.y = this.touchTilt.y * this.gravityNum.y;
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.stopAllFoodDragging(pointer);
      this.resetTouchTilt();
    });
    this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
      this.stopAllFoodDragging(pointer);
      this.resetTouchTilt();
    });
    this.input.on("gameout", (pointer: Phaser.Input.Pointer) => {
      if (!pointer?.isDown && pointer?.buttons === 0) {
        this.stopAllFoodDragging(pointer);
        this.resetTouchTilt();
      }
    });
    this.onWindowPointerUp = () => {
      if (this.isAnyFoodDragging()) {
        this.stopAllFoodDragging();
        this.resetTouchTilt();
      }
    };
    window.addEventListener("pointerup", this.onWindowPointerUp);
    window.addEventListener("mouseup", this.onWindowPointerUp);

    this.tray = this.add.image(this.width / 2, this.height / 2, 'tray');
    this.tray.setSize(this.tray.width-20,this.tray.height-3)
    this.tray.setScale(1.6)
    
    this.scoreText = this.add.text(14, 13, '0', { fontSize: '22px', fontStyle: 'bold', color: '#313' });
    this.scoreText.setVisible(false);
    this.currentHighScore = this.loadHighScore();
    this.highScoreText = this.add.text(14, 43, 'HI ' + this.currentHighScore, { fontSize: '15px', fontStyle: 'bold', color: '#201' });
    this.highScoreText.setVisible(false);
    this.scoreLabel.textContent = this.scoreText.text;
    this.highScoreLabel.textContent = this.highScoreText.text;

    this.foods = this.add.group();
    this.foods.runChildUpdate = true;
    for (let index = 0; index < this.foodCount; index++) {
      let newF= new Food(this)
      this.foods.add(newF, true)
    }

    this.ants = this.add.group();
    this.ants.runChildUpdate = true;
    for (let i = 0; i < this.initialAnts; i++) {
      this.addNewAnt()
    }

    this.physics.add.collider(this.ants, this.foods, this.antHitFood, (_ant, food) => !(food as Food).isBeingDragged && !(food as Food).isBeingCarried, this);
    this.physics.add.collider(this.ants, this.ants, null, null, this);
    this.caterpillars = this.add.group();
    this.caterpillars.runChildUpdate = true;
    for (let i = 0; i < this.initialCaterpillars; i++) {
      this.addNewCaterpillar();
    }

    this.physics.add.collider(this.caterpillars, this.foods, this.eatFood, (_worm, food) => !(food as Food).isBeingDragged && !(food as Food).isBeingCarried, this);
    this.physics.add.collider(this.caterpillars, this.ants, null, null, this);
    this.physics.add.collider(this.caterpillars, this.caterpillars, null, null, this);

    // this.physics.add.overlap(this.ants, this.tray, this.antOut, null, this);
    // this.ants.children.iterate((z:Ant)=>z.init())
    // Prefer orientation angles when available; raw acceleration is the fallback input.
    this.deviceMotionHandler = (event: DeviceMotionEvent) => {
      if (this.deviceTilt) {
        return;
      }
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration || acceleration.x === null || acceleration.y === null) {
        return;
      }
      const screenAngle = getScreenOrientationAngle(
        screen.orientation?.angle,
        (window as unknown as { orientation?: number }).orientation
      );
      const motionTilt = calculateDeviceMotionTilt(
        acceleration.x,
        acceleration.y,
        screenAngle
      );
      this.hasMotionInput = true;
      this.gravity.x = motionTilt.x * this.gravityNum.x;
      this.gravity.y = motionTilt.y * this.gravityNum.y;
      this.gravity.z = acceleration.z ?? 0;
    };
    this.deviceOrientationHandler = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) {
        return;
      }
      this.latestOrientation = { beta: event.beta, gamma: event.gamma };
      if (this.sensorRecenterButton) {
        this.sensorRecenterButton.style.display = "block";
      }
      // Treat the first valid reading as level to avoid an initial jump in gravity.
      if (!this.sensorBaseline) {
        this.sensorBaseline = { beta: event.beta, gamma: event.gamma };
        this.deviceTilt = { x: 0, y: 0 };
        this.gravity.x = 0;
        this.gravity.y = 0;
        return;
      }

      const screenAngle = getScreenOrientationAngle(
        screen.orientation?.angle,
        (window as unknown as { orientation?: number }).orientation
      );
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
    // The title tap already unlocked audio; the music survives restarts, so this only resumes it.
    this.audio.startMusic();
  }


  // antOut(ant: Ant, tray: Phaser.Physics.Arcade.Sprite) {
  //   ant.outOfTray()
  // }

  addNewCaterpillar() {
    const caterpillar = new Caterpillar(this);
    this.caterpillars.add(caterpillar, true);
  }

  wormDied(_caterpillar: Caterpillar) {
    if (this.gameOver) {
      return;
    }
    const outcome = resolveCaterpillarEscape(this.score);
    this.score = outcome.score;
    this.scoreText.setText(this.score.toString());
    this.scoreLabel.textContent = this.score.toString();
    this.audio.play(AUDIO_KEYS.antFall);
  }

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
    this.ants.add(ant, true);
    if (DEBUG_MODE && ant.debugColor) {
      ant.setTintFill(debugColorToTint(ant.debugColor));
    }
  }

  antHitFood(ant: Ant, food: Food) {
    if (food.isBeingDragged || food.isBeingEaten || food.isBeingCarried) {
      return;
    }
    ant.stealFood(food);
  }

  eatFood(ant: Ant | Caterpillar, food: Food) {
    if (food.isBeingDragged) {
      return;
    }
    food.beingEat(ant);
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

    // Sensor gravity drives physics; the canvas tilt is a separate visual effect.
    if (this.deviceTilt) {
      this.applyVisualTilt(
        this.deviceTilt.x * GameScene.maxVisualTilt,
        this.deviceTilt.y * GameScene.maxVisualTilt
      );
    } else if (this.touchTilt) {
      this.applyVisualTilt(
        this.touchTilt.x * GameScene.maxVisualTilt,
        this.touchTilt.y * GameScene.maxVisualTilt
      );
    } else if (this.sys.game.device.os.desktop && !this.hasMotionInput) {
      this.checkCursors();
      this.applyBoardTilt(this.gravity.x, this.gravity.y);
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
    // Transform the canvas alone so the stationary background and HUD do not shift.
    const nextTransform = `perspective(900px) rotateX(${-tiltY}deg) rotateY(${tiltX}deg)`;
    if (nextTransform !== this.currentCanvasTransform) {
      this.currentCanvasTransform = nextTransform;
      this.gameCanvas.style.transform = nextTransform;
    }
  }

  private recenterDeviceTilt() {
    if (!this.latestOrientation) {
      return;
    }

    // The current device pose becomes the new neutral pose.
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

  private createSoundToggleButton() {
    // A sibling layer (not inside the HUD) so the HUD keeps containing only the score text.
    const button = document.createElement("button");
    button.id = "sound-toggle";
    button.type = "button";
    Object.assign(button.style, {
      position: "absolute",
      zIndex: "10001",
      padding: "0.25em 0.45em",
      border: "0",
      borderRadius: "0.4em",
      color: "#201",
      background: "rgba(255, 255, 255, 0.9)",
      font: "bold 18px sans-serif",
      lineHeight: "1.2",
      cursor: "pointer",
      pointerEvents: "auto"
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.audio.toggleMute();
      this.refreshSoundToggleButton();
    });
    this.soundToggleButton = button;
    this.refreshSoundToggleButton();
    this.visualLayerParent.appendChild(button);
  }

  private refreshSoundToggleButton() {
    if (!this.soundToggleButton) {
      return;
    }
    const muted = this.audio.muted;
    this.soundToggleButton.textContent = muted ? "🔇" : "🔊";
    this.soundToggleButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    this.soundToggleButton.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  private createVisualLayers(gameCanvas: HTMLCanvasElement) {
    this.gameCanvas = gameCanvas;
    this.currentCanvasTransform = "";
    this.gameCanvas.id = "tilting-board";
    this.originalScaleUpdateCenter = this.scale.updateCenter;
    this.scale.updateCenter = this.updateCanvasCenterWithoutTransform;
    Object.assign(this.gameCanvas.style, {
      transformOrigin: "center center",
      transition: "transform 120ms ease-out",
      userSelect: "none",
      webkitUserSelect: "none",
      touchAction: "none"
    });
    this.visualLayerParent = gameCanvas.parentElement || document.body;
    this.setVisualLayerParent(this.visualLayerParent);

    // Put the grass behind the canvas as a DOM layer so it never inherits the canvas tilt.
    this.stationaryBackground = document.createElement("div");
    this.stationaryBackground.id = "stationary-background";
    Object.assign(this.stationaryBackground.style, {
      position: "absolute",
      backgroundImage: 'url("./assets/images/grass.png")',
      backgroundPosition: "center",
      backgroundRepeat: "repeat",
      pointerEvents: "none"
    });
    this.visualLayerParent.insertBefore(this.stationaryBackground, gameCanvas);

    this.hudOverlay = document.createElement("div");
    this.hudOverlay.id = "stationary-hud";
    Object.assign(this.hudOverlay.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "11",
      overflow: "hidden"
    });
    this.scoreLabel = this.createHudLabel("score-label", "#313");
    this.highScoreLabel = this.createHudLabel("high-score-label", "#201");
    this.hudOverlay.append(this.scoreLabel, this.highScoreLabel);
    this.visualLayerParent.appendChild(this.hudOverlay);
    this.createGameOverOverlay();
    this.createSoundToggleButton();
    this.createRotatePromptOverlay();
    this.syncVisualLayerBounds(gameCanvas);

    this.visualLayerResizeObserver = new ResizeObserver(this.invalidateVisualLayerBounds);
    this.visualLayerResizeObserver.observe(gameCanvas);
    this.visualLayerResizeObserver.observe(this.visualLayerParent);
    this.visualLayerMutationObserver = new MutationObserver(() => {
      this.invalidateVisualLayerBounds();
      const parent = this.gameCanvas.parentElement || document.body;
      this.visualLayerResizeObserver?.observe(parent);
    });
    this.visualLayerMutationObserver.observe(this.visualLayerParent, { childList: true });
    window.addEventListener("resize", this.invalidateVisualLayerBounds);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.invalidateVisualLayerBounds);
  }

  resetTouchTilt = () => {
    this.touchDragOrigin = null;
    if (!this.deviceTilt && !this.hasMotionInput && this.touchTilt) {
      this.touchTilt = null;
      this.gravity.x = 0;
      this.gravity.y = 0;
    }
  };

  isAnyFoodDragging(): boolean {
    return this.foods?.getChildren().some((child) => (child as Food).isBeingDragged) ?? false;
  }

  getDraggedFood(): Food | null {
    return (this.foods?.getChildren().find((child) => (child as Food).isBeingDragged) as Food) ?? null;
  }

  private stopAllFoodDragging(pointer?: Phaser.Input.Pointer) {
    this.foods?.getChildren().forEach((child) => {
      const food = child as Food;
      if (food.isBeingDragged) {
        food.finishDrag(pointer);
      }
    });
  }

  private tryStartFoodDragAtPointer(pointer: Phaser.Input.Pointer): boolean {
    if (!this.foods) {
      return false;
    }
    const px = pointer.x;
    const py = pointer.y;
    const foods = this.foods.getChildren() as Food[];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      if (!food.active || !food.body?.enable) {
        continue;
      }
      if (food.getBounds().contains(px, py) || areFoodsOverlapping({ x: px, y: py }, food, 36)) {
        if (food.startDrag(pointer)) {
          return true;
        }
      }
    }
    return false;
  }

  private updateCanvasCenterWithoutTransform = () => {
    if (this.scale.autoCenter === Phaser.Scale.NO_CENTER) {
      return;
    }

    const canvasStyle = getComputedStyle(this.gameCanvas);
    const width = Number.parseFloat(canvasStyle.width);
    const height = Number.parseFloat(canvasStyle.height);
    let offsetX = Math.floor((this.scale.parentSize.width - width) / 2);
    let offsetY = Math.floor((this.scale.parentSize.height - height) / 2);

    if (this.scale.autoCenter === Phaser.Scale.CENTER_HORIZONTALLY) {
      offsetY = 0;
    } else if (this.scale.autoCenter === Phaser.Scale.CENTER_VERTICALLY) {
      offsetX = 0;
    }

    this.gameCanvas.style.marginLeft = `${offsetX}px`;
    this.gameCanvas.style.marginTop = `${offsetY}px`;
  };

  private createGameOverOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "game-over-title");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "12",
      background: "rgba(15, 32, 12, 0.58)",
      color: "#172312",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      pointerEvents: "auto",
      boxSizing: "border-box"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(90%, 22em)",
      boxSizing: "border-box",
      padding: "1.15em",
      borderRadius: "0.8em",
      background: "#fffdf4",
      boxShadow: "0 0.5em 1.5em rgba(0, 0, 0, 0.3)"
    });

    const title = document.createElement("h2");
    title.id = "game-over-title";
    title.textContent = "¡Fin de la partida!";
    Object.assign(title.style, { margin: "0 0 0.75em", fontSize: "1.45em" });

    const score = document.createElement("p");
    score.style.margin = "0.4em 0";
    score.append("Puntaje: ");
    this.finalScoreValue = document.createElement("span");
    this.finalScoreValue.id = "game-over-score";
    score.appendChild(this.finalScoreValue);

    const highScore = document.createElement("p");
    highScore.style.margin = "0.4em 0 1em";
    highScore.append("Récord: ");
    this.finalHighScoreValue = document.createElement("span");
    this.finalHighScoreValue.id = "game-over-record";
    highScore.appendChild(this.finalHighScoreValue);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: "0.55em"
    });

    const createButton = (id: string, label: string, background: string, onClick: () => void) => {
      const button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        flex: "1 1 9em",
        minHeight: "2.7em",
        padding: "0.6em 0.8em",
        border: "0",
        borderRadius: "0.45em",
        background,
        color: "white",
        font: "inherit",
        fontWeight: "700",
        cursor: "pointer"
      });
      button.addEventListener("click", onClick);
      return button;
    };

    actions.append(
      createButton("game-over-restart", "Volver a jugar", "#26733a", () => this.restart()),
      createButton("game-over-home", "Volver al inicio", "#4b5948", () => this.returnToTitle())
    );
    panel.append(title, score, highScore, actions);
    overlay.appendChild(panel);
    this.gameOverOverlay = overlay;
    this.visualLayerParent.appendChild(overlay);
  }

  private createHudLabel(id: string, color: string) {
    const label = document.createElement("div");
    label.id = id;
    Object.assign(label.style, {
      position: "absolute",
      color,
      fontFamily: "Courier, monospace",
      fontWeight: "bold",
      whiteSpace: "pre"
    });
    return label;
  }

  private syncVisualLayerBounds(gameCanvas: HTMLCanvasElement) {
    // Phaser scales its canvas to fit the page; mirror that layout for fixed DOM overlays.
    this.setVisualLayerParent(gameCanvas.parentElement || document.body);
    const canvasStyle = getComputedStyle(gameCanvas);
    const layout = calculateVisualLayerLayout({
      left: gameCanvas.offsetLeft,
      top: gameCanvas.offsetTop,
      width: Number.parseFloat(canvasStyle.width),
      height: Number.parseFloat(canvasStyle.height)
    }, this.width, this.height);
    Object.assign(this.hudOverlay.style, {
      left: `${layout.left}px`,
      top: `${layout.top}px`,
      width: `${layout.width}px`,
      height: `${layout.height}px`
    });
    this.gameOverOverlay!.style.left = `${layout.left}px`;
    this.gameOverOverlay!.style.top = `${layout.top}px`;
    this.gameOverOverlay!.style.width = `${layout.width}px`;
    this.gameOverOverlay!.style.height = `${layout.height}px`;
    this.gameOverOverlay!.style.fontSize = `${16 * layout.scaleX}px`;
    const grass = this.textures.get("grass").getSourceImage() as HTMLImageElement;
    const overscanX = 60 * layout.scaleX;
    const overscanY = 60 * layout.scaleY;
    Object.assign(this.stationaryBackground!.style, {
      left: `${layout.left - overscanX}px`,
      top: `${layout.top - overscanY}px`,
      width: `${layout.width + overscanX * 2}px`,
      height: `${layout.height + overscanY * 2}px`,
      backgroundSize: `${grass.width * 2.3 * layout.scaleX}px ${grass.height * 2.3 * layout.scaleY}px`
    });
    Object.assign(this.scoreLabel.style, {
      left: `${14 * layout.scaleX}px`,
      top: `${13 * layout.scaleY}px`,
      fontSize: `${22 * layout.scaleX}px`
    });
    Object.assign(this.highScoreLabel.style, {
      left: `${14 * layout.scaleX}px`,
      top: `${43 * layout.scaleY}px`,
      fontSize: `${15 * layout.scaleX}px`
    });
    if (this.soundToggleButton) {
      this.soundToggleButton.style.fontSize = `${18 * layout.scaleX}px`;
      this.soundToggleButton.style.left = `${layout.left + 8}px`;
      this.soundToggleButton.style.top = `${layout.top + layout.height - this.soundToggleButton.offsetHeight - 8}px`;
    }
    if (this.sensorRecenterButton) {
      this.sensorRecenterButton.style.left = `${layout.left + layout.width - this.sensorRecenterButton.offsetWidth - 8}px`;
      this.sensorRecenterButton.style.top = `${layout.top + 8}px`;
      this.sensorRecenterButton.style.right = "auto";
    }
    if (this.rotateOverlay) {
      this.rotateOverlay.style.left = `${layout.left}px`;
      this.rotateOverlay.style.top = `${layout.top}px`;
      this.rotateOverlay.style.width = `${layout.width}px`;
      this.rotateOverlay.style.height = `${layout.height}px`;
      const isMobile = navigator.maxTouchPoints > 0 || Boolean((navigator as any).userAgentData?.mobile);
      const isPortrait = window.innerHeight > window.innerWidth;
      this.rotateOverlay.style.display = isMobile && isPortrait ? "flex" : "none";
    }
    this.scale.updateBounds();
    if (this.scale.canvasBounds.width > 0 && this.scale.canvasBounds.height > 0) {
      this.scale.displayScale.set(
        this.scale.baseSize.width / this.scale.canvasBounds.width,
        this.scale.baseSize.height / this.scale.canvasBounds.height
      );
    }
    this.visualLayerBoundsDirty = false;
  }

  private syncVisualLayerBoundsWhenNeeded() {
    if (this.visualLayerBoundsDirty) {
      this.syncVisualLayerBounds(this.gameCanvas);
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

    for (const layer of [this.hudOverlay, this.sensorRecenterButton, this.soundToggleButton, this.gameOverOverlay]) {
      if (layer && layer.parentElement !== parent) {
        parent.appendChild(layer);
      }
    }
    if (this.stationaryBackground && this.gameCanvas.parentElement === parent
      && this.stationaryBackground.parentElement !== parent) {
      parent.insertBefore(this.stationaryBackground, this.gameCanvas);
    }
  }

  private createRotatePromptOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "rotate-device-overlay";
    overlay.setAttribute("role", "note");
    overlay.setAttribute("aria-live", "polite");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "0.8em",
      zIndex: "20",
      background: "rgba(15, 32, 12, 0.88)",
      color: "#fffdf4",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      padding: "1.5em",
      boxSizing: "border-box",
      pointerEvents: "none"
    });

    const icon = document.createElement("div");
    icon.textContent = "📱 🔄";
    icon.style.fontSize = "2.5em";

    const text = document.createElement("p");
    text.textContent = "Gira tu dispositivo a horizontal\nPlease rotate your device to landscape";
    Object.assign(text.style, {
      margin: "0",
      fontSize: "1.1em",
      fontWeight: "600",
      lineHeight: "1.4"
    });

    overlay.append(icon, text);
    this.rotateOverlay = overlay;
    this.visualLayerParent.appendChild(overlay);
  }

  private destroyVisualLayers() {
    // A restarted scene reuses the canvas, so remove observers, transforms, and DOM layers first.
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncVisualLayerBoundsWhenNeeded, this);
    this.visualLayerResizeObserver?.disconnect();
    this.visualLayerResizeObserver = null;
    this.visualLayerMutationObserver?.disconnect();
    this.visualLayerMutationObserver = null;
    window.removeEventListener("resize", this.invalidateVisualLayerBounds);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.invalidateVisualLayerBounds);
    if (this.originalScaleUpdateCenter) {
      this.scale.updateCenter = this.originalScaleUpdateCenter;
      this.originalScaleUpdateCenter = null;
    }
    this.hudOverlay?.remove();
    this.gameOverOverlay?.remove();
    this.stationaryBackground?.remove();
    this.rotateOverlay?.remove();
    this.hudOverlay = null;
    this.gameOverOverlay = null;
    this.stationaryBackground = null;
    this.rotateOverlay = null;
    this.currentCanvasTransform = "";
    this.gameCanvas.style.transform = "";
    this.sensorRecenterButton?.remove();
    this.sensorRecenterButton = null;
    this.soundToggleButton?.remove();
    this.soundToggleButton = null;
    if (this.onWindowPointerUp) {
      window.removeEventListener("pointerup", this.onWindowPointerUp);
      window.removeEventListener("mouseup", this.onWindowPointerUp);
      this.onWindowPointerUp = null;
    }
    for (const [parent, originalPosition] of this.visualLayerParentPositions) {
      parent.style.position = originalPosition;
    }
    this.visualLayerParentPositions.clear();
  }

  private removeMotionListeners() {
    // Window listeners outlive a Phaser scene unless explicitly removed.
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
    const left = this.cursors.left.isDown || Boolean(this.wasdKeys?.left.isDown);
    const right = this.cursors.right.isDown || Boolean(this.wasdKeys?.right.isDown);
    const up = this.cursors.up.isDown || Boolean(this.wasdKeys?.up.isDown);
    const down = this.cursors.down.isDown || Boolean(this.wasdKeys?.down.isDown);

    if (left) {
      this.gravity.x = -this.gravityNum.x;
    } else if (right) {
      this.gravity.x = this.gravityNum.x;
    } else {
      this.gravity.x = 0;
    }

    if (up) {
      this.gravity.y = -this.gravityNum.y;
    } else if (down) {
      this.gravity.y = this.gravityNum.y;
    } else {
      this.gravity.y = 0;
    }
  }

}
