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
  calculateWaveExtraAnts,
  canPauseGame,
  debugColorToTint,
  formatLevelObjective,
  formatLevelCompleteSummary,
  getLevelConfig,
  isFinalWaveTriggered,
  isLevelGoalMet,
  LevelConfig,
  getScreenOrientationAngle,
  isNewHighScore,
  isTabletDevice,
  MAX_CARRIER_ANTS,
  parseStoredHighScore,
  resolveAntEscape,
  resolveCaterpillarEscape,
  resolveFoodLoss,
  togglePauseState
} from "../game-rules";
import { Ant } from "../objects/ant";
import { Caterpillar } from "../objects/caterpillar";
import { Food } from "../objects/food";
import { screenWakeLock } from "../services/wake-lock";
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
  private pauseToggleButton: HTMLButtonElement | null = null;
  private pauseOverlay: HTMLDivElement | null = null;
  isPaused: boolean = false;
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
  currentLevel: number = 1;
  currentLevelConfig: LevelConfig = getLevelConfig(1);
  levelProgress: number = 0;
  hasTriggeredFinalWave: boolean = false;
  isLevelTransitioning: boolean = false;
  get isTiltEnabled(): boolean {
    return Boolean(this.currentLevelConfig?.tiltEnabled);
  }
  get isDragEnabled(): boolean {
    return Boolean(this.currentLevelConfig?.dragEnabled);
  }
  isLevelCompleteActive: boolean = false;
  pendingNextLevel: number = 2;
  private levelCompleteOverlay: HTMLDivElement | null = null;
  private levelCompleteTitle: HTMLHeadingElement | null = null;
  private levelCompleteSubtitle: HTMLDivElement | null = null;
  private levelCompleteInstruction: HTMLDivElement | null = null;
  private levelCompleteScore: HTMLSpanElement | null = null;
  private levelCompleteContinueButton: HTMLButtonElement | null = null;
  private pauseSoundButton: HTMLButtonElement | null = null;
  private pauseInfoContainer: HTMLDivElement | null = null;
  private pauseLevelLabel: HTMLDivElement | null = null;
  private pauseStatsLabel: HTMLDivElement | null = null;
  private levelHud: HTMLDivElement | null = null;
  private levelLabel: HTMLSpanElement | null = null;
  private objectiveLabel: HTMLSpanElement | null = null;
  private levelBanner: HTMLDivElement | null = null;
  private levelBannerTitle: HTMLDivElement | null = null;
  private levelBannerSubtitle: HTMLDivElement | null = null;
  private levelBannerInstruction: HTMLDivElement | null = null;
  private levelBannerTimeout: any = null;
  private levelBannerFadeTimeout: any = null;
  private finalLevelValue: HTMLSpanElement | null = null;
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
  private fullscreenToggleButton: HTMLButtonElement | null = null;
  private fullscreenPromptOverlay: HTMLDivElement | null = null;

  constructor() {
    super({
      key: "GameScene"
    });
  }

  init(): void {
    super.init();
    this.score = 0;
    this.gameOver = false;
    this.isPaused = false;
    this.isLevelCompleteActive = false;
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

    if (!this.isLevelTransitioning && this.currentLevelConfig?.goalType === "defeat_ants") {
      this.levelProgress += 1;
      this.updateLevelHud();
      this.checkFinalWave();
      this.checkLevelCompletion();
    }
  }

  destroyFood(food: Food) {
    if (this.gameOver || this.isLevelTransitioning) {
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
    if (this.isPaused) {
      this.isPaused = false;
      if (this.pauseOverlay) {
        this.pauseOverlay.style.display = "none";
        this.pauseOverlay.setAttribute("aria-hidden", "true");
      }
    }
    if (this.pauseToggleButton) {
      this.pauseToggleButton.style.display = "none";
    }
    if (isNewHighScore(this.score, this.currentHighScore)) {
      this.currentHighScore = this.score;
      this.saveHighScore(this.currentHighScore);
    }
    this.highScoreLabel.textContent = `HI ${this.currentHighScore}`;
    if (this.finalLevelValue) {
      this.finalLevelValue.textContent = this.currentLevel.toString();
    }
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
    this.isPaused = false;
    this.destroyVisualLayers();
    this.removeMotionListeners();
    this.scene.restart();
  }

  private returnToTitle() {
    this.isPaused = false;
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
    const pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    pKey.on("down", () => this.togglePause());
    const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    escKey.on("down", () => this.togglePause());
    const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey.on("down", () => {
      if (this.isLevelCompleteActive) {
        this.continueToNextLevel();
      }
    });
    const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.on("down", () => {
      if (this.isLevelCompleteActive) {
        this.continueToNextLevel();
      }
    });
    this.wasdKeys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as any;

    // Touch / pointer drag tilt fallback when device motion is unavailable or denied
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || this.isPaused) {
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
      if (this.gameOver || this.isPaused) {
        return;
      }
      const draggedFood = this.getDraggedFood();
      if (draggedFood) {
        this.resetTouchTilt();
        if (!pointer.isDown && pointer.buttons === 0) {
          draggedFood.finishDrag(pointer);
          return;
        }
        const px = pointer.x;
        const py = pointer.y;
        draggedFood.moveDrag(px - draggedFood.dragOffsetX, py - draggedFood.dragOffsetY, pointer.event?.timeStamp);
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
    try {
      history.pushState({ inGame: true }, "");
    } catch {}
    window.addEventListener("popstate", this.onPopState);
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", this.onFullscreenChange);
    screenWakeLock.acquire().catch(() => {});

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

    this.physics.add.collider(this.ants, this.foods, this.antHitFood, (ant, food) => !(ant as Ant).carriedFood && !(food as Food).isBeingDragged && (food as Food).carrierCount < MAX_CARRIER_ANTS, this);
    this.physics.add.collider(this.ants, this.ants, null, null, this);
    this.caterpillars = this.add.group();
    this.caterpillars.runChildUpdate = true;
    for (let i = 0; i < this.initialCaterpillars; i++) {
      this.addNewCaterpillar();
    }

    this.physics.add.collider(this.caterpillars, this.foods, this.eatFood, (worm, food) => (worm as Caterpillar).isAlive && !(worm as Caterpillar).isClimbing && !(food as Food).isBeingDragged && !(food as Food).isBeingCarried, this);
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

    const urlParams = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search) : null;
    const paramLevel = urlParams?.get("level");
    const startingLevel = paramLevel ? Number(paramLevel) : 1;
    this.startLevel(Number.isFinite(startingLevel) && startingLevel > 0 ? startingLevel : 1);
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

  playAntFallAudio() {
    this.audio?.play(AUDIO_KEYS.antFall);
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
    if (this.isLevelTransitioning || food.isBeingDragged || food.isBeingEaten || food.carrierCount >= MAX_CARRIER_ANTS) {
      return;
    }
    ant.stealFood(food);
  }

  eatFood(ant: Ant | Caterpillar, food: Food) {
    if (this.isLevelTransitioning || food.isBeingDragged || food.isBeingCarried) {
      return;
    }
    food.beingEat(ant);
    // ant.eating()
  }

  update(_time?: number, delta: number = 16): void {
    if (this.gameOver || this.isPaused || this.isLevelCompleteActive) {
      if (this.gameOver || this.isLevelCompleteActive) {
        this.applyBoardTilt(0, 0);
      }
      return;
    }

    if (!this.isLevelTransitioning && this.currentLevelConfig?.goalType === "survive_time") {
      this.levelProgress += delta / 1000;
      this.updateLevelHud();
      this.checkFinalWave();
      this.checkLevelCompletion();
    }

    if (!this.isTiltEnabled) {
      this.gravity.x = 0;
      this.gravity.y = 0;
      this.applyBoardTilt(0, 0);
      return;
    }

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


  private createPauseToggleButton() {
    const button = document.createElement("button");
    button.id = "pause-toggle";
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
      this.togglePause();
    });
    this.pauseToggleButton = button;
    this.refreshPauseToggleButton();
    this.visualLayerParent.appendChild(button);
  }

  private refreshPauseToggleButton() {
    if (!this.pauseToggleButton) {
      return;
    }
    const paused = this.isPaused;
    this.pauseToggleButton.textContent = paused ? "▶" : "⏸";
    this.pauseToggleButton.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
    this.pauseToggleButton.setAttribute("aria-pressed", paused ? "true" : "false");
  }

  private createPauseOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "pause-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "pause-title");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "90",
      background: "rgba(15, 32, 12, 0.65)",
      color: "#172312",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      pointerEvents: "auto",
      boxSizing: "border-box",
      padding: "8px"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(92%, 24em)",
      maxHeight: "min(90%, 90vh)",
      overflowY: "auto",
      boxSizing: "border-box",
      padding: "0.8em 1.2em",
      borderRadius: "0.8em",
      background: "#fffdf4",
      boxShadow: "0 0.5em 1.5em rgba(0, 0, 0, 0.3)"
    });

    const title = document.createElement("h2");
    title.id = "pause-title";
    title.textContent = "Partida pausada / Game Paused";
    Object.assign(title.style, { margin: "0 0 0.35em", fontSize: "1.25em", color: "#172312" });

    const infoContainer = document.createElement("div");
    Object.assign(infoContainer.style, {
      background: "rgba(46, 117, 43, 0.08)",
      border: "1px solid rgba(46, 117, 43, 0.2)",
      borderRadius: "0.5em",
      padding: "0.45em 0.7em",
      margin: "0.2em 0 0.6em",
      textAlign: "center"
    });

    const levelLabel = document.createElement("div");
    levelLabel.id = "pause-level-info";
    Object.assign(levelLabel.style, {
      fontWeight: "bold",
      fontSize: "0.95em",
      color: "#214d23"
    });

    const statsLabel = document.createElement("div");
    statsLabel.id = "pause-stats-info";
    Object.assign(statsLabel.style, {
      fontSize: "0.85em",
      color: "#4b5948",
      marginTop: "0.2em"
    });

    infoContainer.append(levelLabel, statsLabel);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(9.5em, 1fr))",
      gap: "0.45em",
      marginTop: "0.5em"
    });

    const createButton = (id: string, label: string, background: string, onClick: () => void) => {
      const button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        minHeight: "2.3em",
        padding: "0.45em 0.7em",
        border: "0",
        borderRadius: "0.45em",
        background,
        color: "white",
        font: "inherit",
        fontSize: "0.88em",
        fontWeight: "700",
        cursor: "pointer",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)"
      });
      button.addEventListener("click", onClick);
      return button;
    };

    const resumeBtn = createButton("pause-resume", "▶ Reanudar / Resume", "#26733a", () => this.togglePause(false));
    const restartLevelBtn = createButton("pause-restart", "🔄 Reiniciar nivel / Restart Level", "#a25b12", () => {
      this.restartCurrentLevel();
    });
    const restartGameBtn = createButton("pause-restart-game", "⏮ Reiniciar juego / Restart Game", "#b33a2b", () => {
      this.restartWholeGame();
    });
    const soundBtn = createButton("pause-sound", "🔊 Sound: ON", "#3a6b88", () => {
      this.togglePauseSound();
    });
    this.pauseSoundButton = soundBtn;

    const homeBtn = createButton("pause-home", "🏠 Inicio / Main Menu", "#4b5948", () => {
      this.togglePause(false);
      this.returnToTitle();
    });

    actions.append(resumeBtn, restartLevelBtn, restartGameBtn, soundBtn, homeBtn);

    panel.append(title, infoContainer, actions);
    overlay.appendChild(panel);

    this.pauseOverlay = overlay;
    this.pauseInfoContainer = infoContainer;
    this.pauseLevelLabel = levelLabel;
    this.pauseStatsLabel = statsLabel;
    this.visualLayerParent.appendChild(overlay);
  }

  restartCurrentLevel() {
    this.togglePause(false);
    this.startLevel(this.currentLevel, true);
  }

  restartWholeGame() {
    this.togglePause(false);
    this.score = 0;
    this.scoreText.setText("0");
    this.scoreLabel.textContent = "0";
    this.startLevel(1, true);
  }

  togglePauseSound() {
    this.audio.toggleMute();
    this.refreshSoundToggleButton();
    this.refreshPauseSoundButton();
  }

  private refreshPauseSoundButton() {
    if (!this.pauseSoundButton) {
      return;
    }
    const muted = this.audio.muted;
    this.pauseSoundButton.textContent = muted ? "🔇 Sound: OFF" : "🔊 Sound: ON";
    this.pauseSoundButton.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }

  private refreshPauseOverlayInfo() {
    if (this.pauseLevelLabel && this.currentLevelConfig) {
      this.pauseLevelLabel.textContent = `Level ${this.currentLevel}: ${this.currentLevelConfig.title} - ${this.currentLevelConfig.subtitle}`;
    }
    if (this.pauseStatsLabel) {
      this.pauseStatsLabel.textContent = `Puntaje / Score: ${this.score}  •  Récord / Best: ${this.currentHighScore}`;
    }
    this.refreshPauseSoundButton();
  }

  togglePause(forceState?: boolean) {
    if (this.gameOver || this.isLevelCompleteActive) {
      return;
    }
    const nextState = typeof forceState === "boolean" ? forceState : togglePauseState(this.isPaused, this.gameOver, this.isLevelCompleteActive);
    if (this.isPaused === nextState) {
      return;
    }
    this.isPaused = nextState;

    if (this.isPaused) {
      this.physics.pause();
      this.anims.pauseAll();
      this.time.paused = true;
      this.audio.pauseMusic();
      this.audio.play(AUDIO_KEYS.uiToggle);
      this.stopAllFoodDragging();
      this.resetTouchTilt();
      this.refreshPauseOverlayInfo();
      if (this.pauseOverlay) {
        this.pauseOverlay.style.display = "flex";
        this.pauseOverlay.setAttribute("aria-hidden", "false");
        this.pauseOverlay.querySelector("button")?.focus();
      }
    } else {
      this.physics.resume();
      this.anims.resumeAll();
      this.time.paused = false;
      this.audio.startMusic();
      this.audio.play(AUDIO_KEYS.uiToggle);
      if (this.pauseOverlay) {
        this.pauseOverlay.style.display = "none";
        this.pauseOverlay.setAttribute("aria-hidden", "true");
      }
    }
    this.refreshPauseToggleButton();
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

  private createLevelCompleteOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "level-complete-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "level-complete-title");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "95",
      background: "rgba(15, 32, 12, 0.65)",
      color: "#172312",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      pointerEvents: "auto",
      boxSizing: "border-box",
      padding: "8px"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(92%, 24em)",
      maxHeight: "min(90%, 90vh)",
      overflowY: "auto",
      boxSizing: "border-box",
      padding: "0.8em 1.2em",
      borderRadius: "0.8em",
      background: "#fffdf4",
      boxShadow: "0 0.5em 1.5em rgba(0, 0, 0, 0.3)"
    });

    const title = document.createElement("h2");
    title.id = "level-complete-title";
    title.textContent = "¡Nivel completado!";
    Object.assign(title.style, { margin: "0 0 0.4em", fontSize: "1.3em", color: "#172312" });

    const scoreContainer = document.createElement("div");
    scoreContainer.style.fontSize = "0.95em";
    scoreContainer.style.fontWeight = "bold";
    scoreContainer.style.marginBottom = "0.6em";
    scoreContainer.append("Puntaje actual: ");
    const scoreVal = document.createElement("span");
    scoreVal.id = "level-complete-score";
    scoreVal.textContent = "0";
    scoreContainer.appendChild(scoreVal);

    const nextContainer = document.createElement("div");
    nextContainer.id = "level-complete-next-container";
    Object.assign(nextContainer.style, {
      background: "rgba(46, 117, 43, 0.08)",
      border: "1px solid rgba(46, 117, 43, 0.2)",
      borderRadius: "0.5em",
      padding: "0.6em 0.8em",
      margin: "0.5em 0 0.8em",
      textAlign: "center"
    });

    const subtitle = document.createElement("div");
    subtitle.id = "level-complete-subtitle";
    Object.assign(subtitle.style, {
      fontWeight: "bold",
      fontSize: "1.02em",
      color: "#214d23",
      lineHeight: "1.3"
    });

    const instruction = document.createElement("div");
    instruction.id = "level-complete-instruction";
    Object.assign(instruction.style, {
      fontSize: "0.88em",
      color: "#4b5948",
      marginTop: "0.3em",
      lineHeight: "1.25"
    });

    nextContainer.append(subtitle, instruction);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "0.5em",
      marginTop: "0.4em"
    });

    const continueBtn = document.createElement("button");
    continueBtn.id = "level-complete-continue";
    continueBtn.type = "button";
    continueBtn.textContent = "Continuar";
    Object.assign(continueBtn.style, {
      flex: "1 1 10em",
      minHeight: "2.4em",
      padding: "0.5em 1.2em",
      border: "0",
      borderRadius: "0.45em",
      background: "#26733a",
      color: "white",
      font: "inherit",
      fontSize: "0.95em",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)"
    });
    continueBtn.addEventListener("click", () => {
      this.continueToNextLevel();
    });

    actions.appendChild(continueBtn);

    panel.append(title, scoreContainer, nextContainer, actions);
    overlay.appendChild(panel);

    this.levelCompleteOverlay = overlay;
    this.levelCompleteTitle = title;
    this.levelCompleteSubtitle = subtitle;
    this.levelCompleteInstruction = instruction;
    this.levelCompleteScore = scoreVal;
    this.levelCompleteContinueButton = continueBtn;
    this.visualLayerParent.appendChild(overlay);
  }

  showLevelCompleteOverlay(completedLevel: number, nextLevel: number) {
    if (!this.levelCompleteOverlay) {
      return;
    }
    const summary = formatLevelCompleteSummary(completedLevel);
    if (this.levelCompleteTitle) {
      this.levelCompleteTitle.textContent = `¡Nivel ${completedLevel} completado!`;
    }
    if (this.levelCompleteScore) {
      this.levelCompleteScore.textContent = this.score.toString();
    }
    if (this.levelCompleteSubtitle) {
      this.levelCompleteSubtitle.textContent = `Siguiente: ${summary.nextTitle} - ${summary.nextSubtitle}`;
    }
    if (this.levelCompleteInstruction) {
      this.levelCompleteInstruction.textContent = summary.nextInstruction;
    }
    this.levelCompleteOverlay.style.display = "flex";
    this.levelCompleteOverlay.setAttribute("aria-hidden", "false");
    this.levelCompleteContinueButton?.focus();
    if (this.gameCanvas) {
      this.syncVisualLayerBounds(this.gameCanvas);
    }
  }

  hideLevelCompleteOverlay() {
    if (this.levelCompleteOverlay) {
      this.levelCompleteOverlay.style.display = "none";
      this.levelCompleteOverlay.setAttribute("aria-hidden", "true");
    }
  }

  continueToNextLevel() {
    if (!this.isLevelCompleteActive || this.gameOver) {
      return;
    }
    this.isLevelCompleteActive = false;
    this.hideLevelCompleteOverlay();
    this.physics.resume();
    this.anims.resumeAll();
    this.time.paused = false;
    const next = this.pendingNextLevel || (this.currentLevel + 1);
    this.startLevel(next);
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
    this.createPauseOverlay();
    this.createLevelCompleteOverlay();
    this.createSoundToggleButton();
    this.createPauseToggleButton();
    this.createFullscreenToggleButton();
    this.createFullscreenPromptOverlay();
    this.createRotatePromptOverlay();
    this.createLevelHud();
    this.createLevelBanner();
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
    if (!this.foods || this.gameOver || this.isPaused || this.isLevelCompleteActive || this.isLevelTransitioning) {
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
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "100",
      background: "rgba(15, 32, 12, 0.65)",
      color: "#172312",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      pointerEvents: "auto",
      boxSizing: "border-box",
      padding: "8px"
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(92%, 24em)",
      maxHeight: "min(90%, 90vh)",
      overflowY: "auto",
      boxSizing: "border-box",
      padding: "0.8em 1.2em",
      borderRadius: "0.8em",
      background: "#fffdf4",
      boxShadow: "0 0.5em 1.5em rgba(0, 0, 0, 0.3)"
    });

    const title = document.createElement("h2");
    title.id = "game-over-title";
    title.textContent = "¡Fin de la partida!";
    Object.assign(title.style, { margin: "0 0 0.35em", fontSize: "1.3em" });

    const statsContainer = document.createElement("div");
    Object.assign(statsContainer.style, {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.3em 0.8em",
      margin: "0.2em 0 0.7em",
      fontSize: "0.95em",
      fontWeight: "bold"
    });

    const levelP = document.createElement("span");
    levelP.append("Nivel: ");
    this.finalLevelValue = document.createElement("span");
    this.finalLevelValue.id = "game-over-level";
    levelP.appendChild(this.finalLevelValue);

    const score = document.createElement("span");
    score.append("Puntaje: ");
    this.finalScoreValue = document.createElement("span");
    this.finalScoreValue.id = "game-over-score";
    score.appendChild(this.finalScoreValue);

    const highScore = document.createElement("span");
    highScore.append("Récord: ");
    this.finalHighScoreValue = document.createElement("span");
    this.finalHighScoreValue.id = "game-over-record";
    highScore.appendChild(this.finalHighScoreValue);

    statsContainer.append(levelP, score, highScore);

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: "0.5em"
    });

    const createButton = (id: string, label: string, background: string, onClick: () => void) => {
      const button = document.createElement("button");
      button.id = id;
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        flex: "1 1 8em",
        minHeight: "2.3em",
        padding: "0.45em 0.7em",
        border: "0",
        borderRadius: "0.45em",
        background,
        color: "white",
        font: "inherit",
        fontSize: "0.9em",
        fontWeight: "700",
        cursor: "pointer",
        whiteSpace: "nowrap"
      });
      button.addEventListener("click", onClick);
      return button;
    };

    actions.append(
      createButton("game-over-restart", "Volver a jugar", "#26733a", () => this.restart()),
      createButton("game-over-home", "Volver al inicio", "#4b5948", () => this.returnToTitle())
    );
    panel.append(title, statsContainer, actions);
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
    const modalScale = Math.min(layout.scaleX, layout.scaleY);
    const modalFontSize = Math.max(11, Math.min(16, 14 * modalScale));
    this.gameOverOverlay!.style.left = "0px";
    this.gameOverOverlay!.style.top = "0px";
    this.gameOverOverlay!.style.width = "100%";
    this.gameOverOverlay!.style.height = "100%";
    this.gameOverOverlay!.style.fontSize = `${modalFontSize}px`;

    if (this.levelHud) {
      this.levelHud.style.left = `${layout.left + layout.width / 2}px`;
      this.levelHud.style.top = `${layout.top + Math.max(6, 10 * layout.scaleY)}px`;
      this.levelHud.style.fontSize = `${Math.max(11, Math.min(16, 14 * modalScale))}px`;
      this.levelHud.style.maxWidth = `${Math.min(layout.width * 0.75, 420)}px`;
    }

    if (this.levelBanner) {
      this.levelBanner.style.left = "50%";
      this.levelBanner.style.top = "50%";
      this.levelBanner.style.fontSize = `${Math.max(11, Math.min(16, 14 * modalScale))}px`;
      this.levelBanner.style.maxWidth = `min(90vw, ${Math.max(280, layout.width * 0.85)}px, 460px)`;
      this.levelBanner.style.maxHeight = `min(80vh, ${Math.max(200, layout.height * 0.8)}px, 260px)`;
    }
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
    if (this.fullscreenToggleButton) {
      this.fullscreenToggleButton.style.fontSize = `${18 * layout.scaleX}px`;
      this.fullscreenToggleButton.style.left = `${layout.left + layout.width - this.fullscreenToggleButton.offsetWidth - 8}px`;
      this.fullscreenToggleButton.style.top = `${layout.top + layout.height - this.fullscreenToggleButton.offsetHeight - 8}px`;
    }
    if (this.fullscreenPromptOverlay) {
      const promptScale = Math.min(layout.scaleX, layout.scaleY);
      this.fullscreenPromptOverlay.style.fontSize = `${Math.max(10, Math.min(13, 12 * promptScale))}px`;
      const promptWidth = Math.min(layout.width * 0.9, 420);
      this.fullscreenPromptOverlay.style.width = "auto";
      this.fullscreenPromptOverlay.style.maxWidth = `${promptWidth}px`;
      this.fullscreenPromptOverlay.style.left = "50%";
      this.fullscreenPromptOverlay.style.transform = "translateX(-50%)";
      this.fullscreenPromptOverlay.style.top = `${Math.max(6, layout.top + 6)}px`;
    }
    if (this.pauseOverlay) {
      this.pauseOverlay.style.left = "0px";
      this.pauseOverlay.style.top = "0px";
      this.pauseOverlay.style.width = "100%";
      this.pauseOverlay.style.height = "100%";
      this.pauseOverlay.style.fontSize = `${modalFontSize}px`;
    }
    if (this.levelCompleteOverlay) {
      this.levelCompleteOverlay.style.left = "0px";
      this.levelCompleteOverlay.style.top = "0px";
      this.levelCompleteOverlay.style.width = "100%";
      this.levelCompleteOverlay.style.height = "100%";
      this.levelCompleteOverlay.style.fontSize = `${modalFontSize}px`;
    }
    if (this.pauseToggleButton) {
      this.pauseToggleButton.style.fontSize = `${18 * layout.scaleX}px`;
      this.pauseToggleButton.style.left = `${layout.left + layout.width - this.pauseToggleButton.offsetWidth - 8}px`;
      this.pauseToggleButton.style.top = `${layout.top + 8}px`;
    }
    if (this.sensorRecenterButton) {
      const pauseOffset = this.pauseToggleButton ? this.pauseToggleButton.offsetWidth + 8 : 0;
      this.sensorRecenterButton.style.left = `${layout.left + layout.width - this.sensorRecenterButton.offsetWidth - 8 - pauseOffset}px`;
      this.sensorRecenterButton.style.top = `${layout.top + 8}px`;
      this.sensorRecenterButton.style.right = "auto";
    }
    if (this.rotateOverlay) {
      const isMobile = navigator.maxTouchPoints > 0 || Boolean((navigator as any).userAgentData?.mobile);
      const isPortrait = window.innerHeight > window.innerWidth;
      if (isMobile && isPortrait) {
        this.rotateOverlay.style.left = "0px";
        this.rotateOverlay.style.top = "0px";
        this.rotateOverlay.style.width = "100%";
        this.rotateOverlay.style.height = "100%";
        this.rotateOverlay.style.display = "flex";
      } else {
        this.rotateOverlay.style.left = `${layout.left}px`;
        this.rotateOverlay.style.top = `${layout.top}px`;
        this.rotateOverlay.style.width = `${layout.width}px`;
        this.rotateOverlay.style.height = `${layout.height}px`;
        this.rotateOverlay.style.display = "none";
      }
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

    for (const layer of [
      this.hudOverlay,
      this.levelHud,
      this.levelBanner,
      this.sensorRecenterButton,
      this.soundToggleButton,
      this.pauseToggleButton,
      this.gameOverOverlay,
      this.pauseOverlay,
      this.levelCompleteOverlay,
      this.fullscreenToggleButton,
      this.fullscreenPromptOverlay
    ]) {
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

  private onPopState = () => {
    if (this.gameOver) {
      return;
    }
    try {
      history.pushState({ inGame: true }, "");
    } catch {}
    if (!this.scale.isFullscreen && this.scale.fullscreen.available) {
      this.showFullscreenPrompt();
    }
  };

  private onFullscreenChange = () => {
    this.refreshFullscreenButton();
    if (!this.scale.isFullscreen && !this.gameOver && this.scale.fullscreen.available) {
      this.showFullscreenPrompt();
    } else {
      this.hideFullscreenPrompt();
    }
  };

  private createFullscreenToggleButton() {
    const button = document.createElement("button");
    button.id = "fullscreen-toggle";
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
      pointerEvents: "auto",
      display: this.scale.fullscreen.available ? "block" : "none"
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleFullscreen();
    });
    this.fullscreenToggleButton = button;
    this.refreshFullscreenButton();
    this.visualLayerParent.appendChild(button);
  }

  private refreshFullscreenButton() {
    if (!this.fullscreenToggleButton) {
      return;
    }
    const isFull = this.scale.isFullscreen;
    this.fullscreenToggleButton.textContent = isFull ? "🗗" : "⛶";
    this.fullscreenToggleButton.setAttribute("aria-label", isFull ? "Exit fullscreen" : "Enter fullscreen");
    this.fullscreenToggleButton.setAttribute("aria-pressed", isFull ? "true" : "false");
  }

  private createFullscreenPromptOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "fullscreen-prompt-overlay";
    overlay.setAttribute("role", "note");
    overlay.setAttribute("aria-live", "polite");
    Object.assign(overlay.style, {
      position: "absolute",
      display: "none",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: "10002",
      background: "rgba(23, 35, 18, 0.94)",
      color: "#fff",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.45)",
      fontFamily: "system-ui, sans-serif",
      fontWeight: "bold",
      boxSizing: "border-box",
      cursor: "pointer",
      pointerEvents: "auto",
      padding: "6px 12px",
      borderRadius: "18px",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      maxWidth: "min(92vw, 420px)"
    });

    const label = document.createElement("span");
    label.textContent = "⛶ Toca para volver a pantalla completa / Tap to restore fullscreen";
    Object.assign(label.style, {
      marginRight: "8px",
      userSelect: "none",
      webkitUserSelect: "none",
      fontSize: "0.85em",
      lineHeight: "1.2"
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Dismiss");
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "0",
      color: "#fff",
      fontSize: "14px",
      cursor: "pointer",
      padding: "2px 6px",
      borderRadius: "4px"
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hideFullscreenPrompt();
    });

    overlay.addEventListener("click", () => {
      this.toggleFullscreen(true);
    });

    overlay.append(label, closeBtn);
    this.fullscreenPromptOverlay = overlay;
    this.visualLayerParent.appendChild(overlay);
  }

  showFullscreenPrompt() {
    if (this.fullscreenPromptOverlay && !this.gameOver && this.scale.fullscreen.available) {
      this.fullscreenPromptOverlay.style.display = "flex";
      this.syncVisualLayerBoundsWhenNeeded();
    }
  }

  hideFullscreenPrompt() {
    if (this.fullscreenPromptOverlay) {
      this.fullscreenPromptOverlay.style.display = "none";
    }
  }

  async toggleFullscreen(forceStart?: boolean) {
    if (forceStart || !this.scale.isFullscreen) {
      if (this.scale.fullscreen.available) {
        this.scale.startFullscreen();
        try {
          const screenAny = screen as any;
          const orientObj = screenAny.orientation ?? screenAny.mozOrientation ?? screenAny.msOrientation;
          await orientObj?.lock?.("landscape-primary")?.catch(() => {});
        } catch {}
      }
      this.hideFullscreenPrompt();
    } else {
      this.scale.stopFullscreen();
    }
    this.refreshFullscreenButton();
  }

  private destroyVisualLayers() {
    // A restarted scene reuses the canvas, so remove observers, transforms, and DOM layers first.
    this.clearLevelBannerTimer();
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
    this.levelHud?.remove();
    this.levelBanner?.remove();
    this.gameOverOverlay?.remove();
    this.stationaryBackground?.remove();
    this.rotateOverlay?.remove();
    this.hudOverlay = null;
    this.levelHud = null;
    this.levelBanner = null;
    this.gameOverOverlay = null;
    this.stationaryBackground = null;
    this.rotateOverlay = null;
    this.currentCanvasTransform = "";
    this.gameCanvas.style.transform = "";
    this.sensorRecenterButton?.remove();
    this.sensorRecenterButton = null;
    this.soundToggleButton?.remove();
    this.soundToggleButton = null;
    this.pauseToggleButton?.remove();
    this.pauseToggleButton = null;
    this.pauseOverlay?.remove();
    this.pauseOverlay = null;
    this.pauseSoundButton = null;
    this.pauseInfoContainer = null;
    this.pauseLevelLabel = null;
    this.pauseStatsLabel = null;
    this.fullscreenToggleButton?.remove();
    this.fullscreenToggleButton = null;
    this.fullscreenPromptOverlay?.remove();
    this.fullscreenPromptOverlay = null;
    window.removeEventListener("popstate", this.onPopState);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", this.onFullscreenChange);
    screenWakeLock.release();
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
    if (!this.isTiltEnabled) {
      this.gravity.x = 0;
      this.gravity.y = 0;
      return;
    }
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


  onAntsShaken(count: number) {
    if (this.gameOver || this.isLevelTransitioning) {
      return;
    }
    if (this.currentLevelConfig?.goalType === "shake_ants") {
      this.levelProgress += count;
      this.updateLevelHud();
      this.checkFinalWave();
      this.checkLevelCompletion();
    }
  }

  startLevel(levelNumber: number, showIntroBanner = true) {
    this.hideLevelCompleteOverlay();
    this.isLevelCompleteActive = false;
    this.isLevelTransitioning = false;
    this.physics.resume();
    this.anims.resumeAll();
    this.time.paused = false;

    this.currentLevel = levelNumber;
    this.currentLevelConfig = getLevelConfig(levelNumber);
    this.levelProgress = 0;
    this.hasTriggeredFinalWave = false;

    if (!this.currentLevelConfig.tiltEnabled) {
      this.gravity.x = 0;
      this.gravity.y = 0;
      this.applyBoardTilt(0, 0);
    }

    this.refillFoods();
    if (this.pauseToggleButton) {
      this.pauseToggleButton.style.display = "block";
    }
    this.syncAntsToLevel();
    this.syncCaterpillarsToLevel();
    this.updateLevelHud();

    if (showIntroBanner) {
      this.showLevelBanner(
        this.currentLevelConfig.title,
        this.currentLevelConfig.subtitle,
        this.currentLevelConfig.instruction,
        2500
      );
    }
  }

  checkFinalWave() {
    if (this.hasTriggeredFinalWave || this.isLevelTransitioning || this.gameOver || !this.currentLevelConfig) {
      return;
    }
    if (isFinalWaveTriggered(this.levelProgress, this.currentLevelConfig.goalTarget)) {
      this.triggerFinalWave();
    }
  }

  triggerFinalWave() {
    this.hasTriggeredFinalWave = true;
    const extraAnts = calculateWaveExtraAnts(this.currentLevel);
    for (let i = 0; i < extraAnts; i++) {
      this.addNewAnt();
    }
    this.audio.play(AUDIO_KEYS.antFall);
    this.showLevelBanner("⚠️ FINAL WAVE!", "Ants incoming!", "Defend the picnic!", 1600);
  }

  checkLevelCompletion() {
    if (this.isLevelTransitioning || this.gameOver || !this.currentLevelConfig) {
      return;
    }
    if (isLevelGoalMet(this.currentLevelConfig.goalType, this.levelProgress, this.currentLevelConfig.goalTarget)) {
      this.completeLevel();
    }
  }

  completeLevel() {
    this.isLevelTransitioning = true;
    this.isLevelCompleteActive = true;
    const completedLevel = this.currentLevel;
    const nextLevel = completedLevel + 1;
    this.pendingNextLevel = nextLevel;

    this.physics.pause();
    this.anims.pauseAll();
    this.stopAllFoodDragging();
    this.resetTouchTilt();
    this.applyBoardTilt(0, 0);

    if (this.pauseToggleButton) {
      this.pauseToggleButton.style.display = "none";
    }

    this.audio.play(AUDIO_KEYS.antFall);
    this.foods?.getChildren().forEach((f: any) => (f as Food).releaseAllCarriers?.(false));

    this.showLevelCompleteOverlay(completedLevel, nextLevel);
  }

  updateLevelHud() {
    if (!this.levelLabel || !this.objectiveLabel || !this.currentLevelConfig) {
      return;
    }
    this.levelLabel.textContent = `LVL ${this.currentLevel}`;
    this.objectiveLabel.textContent = formatLevelObjective(this.currentLevelConfig, this.levelProgress);
  }

  showLevelBanner(title: string, subtitle: string, instruction: string, durationMs = 2000) {
    this.clearLevelBannerTimer();
    if (!this.levelBanner || !this.levelBannerTitle || !this.levelBannerSubtitle || !this.levelBannerInstruction) {
      return;
    }
    if (this.gameCanvas) {
      this.syncVisualLayerBounds(this.gameCanvas);
    }
    this.levelBannerTitle.textContent = title;
    this.levelBannerSubtitle.textContent = subtitle;
    this.levelBannerInstruction.textContent = instruction;
    this.levelBanner.style.display = "flex";
    this.levelBanner.style.opacity = "1";

    if (durationMs > 0) {
      this.levelBannerTimeout = setTimeout(() => {
        this.hideLevelBanner();
      }, durationMs);
    }
  }

  hideLevelBanner() {
    this.clearLevelBannerTimer();
    if (this.levelBanner) {
      this.levelBanner.style.opacity = "0";
      this.levelBannerFadeTimeout = setTimeout(() => {
        this.levelBannerFadeTimeout = null;
        if (this.levelBanner && this.levelBanner.style.opacity === "0") {
          this.levelBanner.style.display = "none";
        }
      }, 300);
    }
  }

  private clearLevelBannerTimer() {
    if (this.levelBannerTimeout) {
      clearTimeout(this.levelBannerTimeout);
      this.levelBannerTimeout = null;
    }
    if (this.levelBannerFadeTimeout) {
      clearTimeout(this.levelBannerFadeTimeout);
      this.levelBannerFadeTimeout = null;
    }
  }

  refillFoods() {
    if (!this.foods || !this.tray) {
      return;
    }
    const currentFoods = this.foods.getChildren().slice() as Food[];
    currentFoods.forEach((food) => {
      food.releaseAllCarriers(false);
      food.isBeingDragged = false;
      food.isDragCooldown = false;
      food.setAlpha(1);
    });

    const activeFoods = currentFoods.filter((f) => f.active && f.body?.enable);
    const needed = Math.max(0, this.initialFood - activeFoods.length);
    for (let i = 0; i < needed; i++) {
      const newF = new Food(this);
      this.foods.add(newF, true);
    }
    this.foodCount = this.foods.getChildren().filter((f: any) => f.active && f.body?.enable).length;
  }

  syncAntsToLevel() {
    if (!this.ants) {
      return;
    }
    const targetCount = this.currentLevelConfig.initialAnts;
    const currentAnts = this.ants.getChildren().slice() as Ant[];

    currentAnts.forEach((ant) => {
      ant.ANT_SPEED = this.currentLevelConfig.antSpeed;
      if (ant.carriedFood) {
        ant.dropFood(false);
      }
    });

    if (currentAnts.length < targetCount) {
      const needed = targetCount - currentAnts.length;
      for (let i = 0; i < needed; i++) {
        this.addNewAnt();
      }
    } else if (currentAnts.length > targetCount) {
      const excess = currentAnts.slice(targetCount);
      excess.forEach((ant) => {
        ant.disableBody(true, true);
        this.ants.remove(ant, true, true);
      });
    }

    (this.ants.getChildren() as Ant[]).forEach((ant) => {
      ant.ANT_SPEED = this.currentLevelConfig.antSpeed;
    });
  }

  syncCaterpillarsToLevel() {
    if (!this.caterpillars) {
      return;
    }
    const targetCount = this.currentLevelConfig.caterpillarsEnabled ? this.currentLevelConfig.initialCaterpillars : 0;
    const currentWorms = this.caterpillars.getChildren().slice() as Caterpillar[];

    if (!this.currentLevelConfig.caterpillarsEnabled) {
      currentWorms.forEach((worm) => {
        worm.disableBody(true, true);
        this.caterpillars.remove(worm, true, true);
      });
      return;
    }

    if (currentWorms.length < targetCount) {
      const needed = targetCount - currentWorms.length;
      for (let i = 0; i < needed; i++) {
        this.addNewCaterpillar();
      }
    } else if (currentWorms.length > targetCount) {
      const excess = currentWorms.slice(targetCount);
      excess.forEach((worm) => {
        worm.disableBody(true, true);
        this.caterpillars.remove(worm, true, true);
      });
    }
  }

  private createLevelHud() {
    const hud = document.createElement("div");
    hud.id = "level-hud";
    Object.assign(hud.style, {
      position: "absolute",
      left: "50%",
      top: "10px",
      zIndex: "15",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
      fontFamily: "Courier, monospace",
      fontWeight: "bold",
      color: "#201",
      whiteSpace: "nowrap",
      maxWidth: "min(85%, 440px)",
      boxSizing: "border-box",
      transform: "translateX(-50%)"
    });

    this.levelLabel = document.createElement("span");
    this.levelLabel.id = "level-label";

    this.objectiveLabel = document.createElement("span");
    this.objectiveLabel.id = "level-objective";

    hud.append(this.levelLabel, this.objectiveLabel);
    this.levelHud = hud;
    this.visualLayerParent.appendChild(hud);
  }

  private createLevelBanner() {
    const banner = document.createElement("div");
    banner.id = "level-banner";
    Object.assign(banner.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      zIndex: "25",
      pointerEvents: "none",
      transition: "opacity 0.3s ease",
      backgroundColor: "rgba(23, 35, 18, 0.94)",
      border: "2px solid rgba(255, 255, 255, 0.3)",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
      color: "#fff",
      fontFamily: "Courier, monospace",
      padding: "8px 16px",
      maxWidth: "min(92%, 460px)",
      maxHeight: "min(80%, 260px)",
      boxSizing: "border-box",
      overflowY: "auto",
      transform: "translate(-50%, -50%)"
    });

    const title = document.createElement("div");
    title.id = "level-banner-title";
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.2em";
    title.style.color = "#ffbe0b";
    title.style.marginBottom = "2px";
    title.style.lineHeight = "1.2";

    const subtitle = document.createElement("div");
    subtitle.id = "level-banner-subtitle";
    subtitle.style.fontWeight = "bold";
    subtitle.style.fontSize = "0.95em";
    subtitle.style.color = "#ffffff";
    subtitle.style.marginBottom = "4px";
    subtitle.style.lineHeight = "1.2";

    const instruction = document.createElement("div");
    instruction.id = "level-banner-instruction";
    instruction.style.fontSize = "0.82em";
    instruction.style.color = "#e0e0e0";
    instruction.style.lineHeight = "1.25";

    banner.append(title, subtitle, instruction);
    this.levelBanner = banner;
    this.levelBannerTitle = title;
    this.levelBannerSubtitle = subtitle;
    this.levelBannerInstruction = instruction;
    this.visualLayerParent.appendChild(banner);
  }

}
