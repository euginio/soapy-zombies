/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 Eugenio Arosteguy
 * @description  Ants Feast: Game Scene
 * @license      
 */

import { ANT_DEBUG_COLORS, DEBUG_MODE } from "../const/const";
import {
  calculateDeviceTilt,
  calculateVisualLayerLayout,
  debugColorToTint,
  isNewHighScore,
  isTabletDevice,
  parseStoredHighScore,
  resolveAntEscape,
  resolveFoodLoss
} from "../game-rules";
import { Ant } from "../objects/ant";
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
  private stationaryBackground: HTMLDivElement | null = null;
  private gameOverOverlay: HTMLDivElement | null = null;
  private finalScoreValue: HTMLSpanElement;
  private finalHighScoreValue: HTMLSpanElement;
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
    // Keep scoring and spawn timing in the pure rule module; this scene applies the result.
    const outcome = resolveAntEscape(this.score, this.zombieRate);
    this.score = outcome.score;
    this.scoreText.setText(this.score.toString());
    this.scoreLabel.textContent = this.score.toString();
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
    const canvas = this.game.canvas;
    // These HTML layers stay fixed while only the Phaser canvas receives a tilt transform.
    this.createVisualLayers(canvas);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncVisualLayerBoundsWhenNeeded, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyVisualLayers, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeMotionListeners, this);
    this.sensorBaseline = null;
    this.deviceTilt = null;
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
    // Prefer orientation angles when available; raw acceleration is the fallback input.
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
      // Treat the first valid reading as level to avoid an initial jump in gravity.
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
    this.ants.add(ant, true);
    if (DEBUG_MODE && ant.debugColor) {
      ant.setTintFill(debugColorToTint(ant.debugColor));
    }
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

    // Sensor gravity drives physics; the canvas tilt is a separate visual effect.
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
    // Transform the canvas alone so the stationary background and HUD do not shift.
    this.gameCanvas.style.transform = `perspective(900px) rotateX(${-tiltY}deg) rotateY(${tiltX}deg)`;
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

  private createVisualLayers(gameCanvas: HTMLCanvasElement) {
    this.gameCanvas = gameCanvas;
    this.gameCanvas.id = "tilting-board";
    this.originalScaleUpdateCenter = this.scale.updateCenter;
    this.scale.updateCenter = this.updateCanvasCenterWithoutTransform;
    Object.assign(this.gameCanvas.style, {
      transformOrigin: "center center",
      transition: "transform 120ms ease-out"
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
    if (this.sensorRecenterButton) {
      this.sensorRecenterButton.style.left = `${layout.left + layout.width - this.sensorRecenterButton.offsetWidth - 8}px`;
      this.sensorRecenterButton.style.top = `${layout.top + 8}px`;
      this.sensorRecenterButton.style.right = "auto";
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

    for (const layer of [this.hudOverlay, this.sensorRecenterButton, this.gameOverOverlay]) {
      if (layer && layer.parentElement !== parent) {
        parent.appendChild(layer);
      }
    }
    if (this.stationaryBackground && this.gameCanvas.parentElement === parent
      && this.stationaryBackground.parentElement !== parent) {
      parent.insertBefore(this.stationaryBackground, this.gameCanvas);
    }
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
    this.hudOverlay = null;
    this.gameOverOverlay = null;
    this.stationaryBackground = null;
    this.gameCanvas.style.transform = "";
    this.sensorRecenterButton?.remove();
    this.sensorRecenterButton = null;
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
