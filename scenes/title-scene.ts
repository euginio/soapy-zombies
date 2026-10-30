/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Ants Feast: Title Scene
 * @license      
 */

import { AUDIO_KEYS, GameAudio } from "../audio/game-audio";
import { MyScene } from "./my-scene";
import { screenWakeLock } from "../services/wake-lock";

export class TitleScene extends MyScene {
  private isStarting = false;
  startTxt: Phaser.GameObjects.Text;
  startBtnContainer?: Phaser.GameObjects.Container;
  titleContainer?: Phaser.GameObjects.Container;
  // explanationDevice: string;
  explanation: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TitleScene" });
  }

  create() {
    // The scene instance is reused when returning from the game, so allow starting again.
    this.isStarting = false;
    screenWakeLock.release();
    // this.explanationDevice = 'inclinando el celular en diferentes sentidos'
    // if (this.sys.game.device.os.desktop) {
    //   this.explanationDevice = 'con las flechas del teclado'
    // }
    // this.explanationDevice = `    ¡Defiende la comida de las hormigas
    //  haciendo que se caigan de la bandeja 
    //  ${this.explanationDevice}!`

    // 1. Lush grass background with soft vignette
    const bg = this.add.sprite(this.width / 2, this.height / 2, "grass");
    bg.setScale(2.3);

    const vignette = this.add.graphics();
    vignette.fillStyle(0x0f230d, 0.22);
    vignette.fillRect(0, 0, this.width, this.height);

    // 2. Picnic tray centerpiece with checkered tablecloth
    const trayY = 150;
    const trayShadow = this.add.graphics();
    trayShadow.fillStyle(0x081307, 0.38);
    trayShadow.fillRoundedRect(this.width / 2 - 170, trayY - 100, 340, 204, 16);

    const tray = this.add.image(this.width / 2, trayY, "tray");
    tray.setScale(1.2);

    // 3. Appetizing picnic food platter
    const foodSpread = [
      { x: this.width / 2 - 58, y: trayY - 6, frame: 7, scale: 1.35, angle: -8 },
      { x: this.width / 2, y: trayY - 12, frame: 12, scale: 1.5, angle: 0 },
      { x: this.width / 2 + 58, y: trayY - 4, frame: 21, scale: 1.35, angle: 8 }
    ];

    foodSpread.forEach((item) => {
      this.add.ellipse(item.x, item.y + 15 * item.scale, 26 * item.scale, 9 * item.scale, 0x000000, 0.28);
      const food = this.add.sprite(item.x, item.y, "food", item.frame);
      food.setScale(item.scale);
      food.setAngle(item.angle);
    });

    // 4. Animated hungry ants & cute caterpillar
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

    // Left sneaky ant advancing along tray handle
    const antLeft = this.add.sprite(this.width / 2 - 128, trayY - 6, "ant_sheet");
    antLeft.setScale(0.24);
    antLeft.setAngle(15);
    antLeft.play("walk");
    this.tweens.add({
      targets: antLeft,
      x: "+=6",
      y: "-=2",
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Right ant sneaking toward the center treats
    const antRight = this.add.sprite(this.width / 2 + 130, trayY + 2, "ant_sheet");
    antRight.setScale(0.24);
    antRight.setAngle(-168);
    antRight.play("walk");
    this.tweens.add({
      targets: antRight,
      x: "-=6",
      y: "+=2",
      duration: 1250,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // Cute caterpillar chilling on the lower tray edge
    const caterpillar = this.add.sprite(this.width / 2 + 96, trayY + 44, "caterpillar");
    caterpillar.setScale(0.22);
    caterpillar.setAngle(-12);
    this.tweens.add({
      targets: caterpillar,
      scaleX: 0.24,
      scaleY: 0.18,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // 5. Stylized Title & Spanish Subtitle Banner
    const titleText = this.add.text(0, -12, "¡Ants Feast!", {
      fontSize: "42px",
      fontFamily: '"Arial Black", "Montserrat", "Trebuchet MS", sans-serif',
      fontStyle: "bold",
      color: "#FFF8D6",
      stroke: "#3B1F05",
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 4, color: "rgba(0,0,0,0.5)", blur: 5, stroke: true, fill: true }
    });
    titleText.setOrigin(0.5, 0.5);

    const subPill = this.add.graphics();
    subPill.fillStyle(0x1a3311, 0.88);
    subPill.lineStyle(1.5, 0xf6d365, 0.95);
    subPill.fillRoundedRect(-125, 14, 250, 20, 10);
    subPill.strokeRoundedRect(-125, 14, 250, 20, 10);

    const subtitleText = this.add.text(0, 24, "¡Defiende la comida del picnic!", {
      fontSize: "11px",
      fontFamily: "system-ui, sans-serif",
      fontStyle: "bold",
      color: "#FFFDF0"
    });
    subtitleText.setOrigin(0.5, 0.5);

    this.titleContainer = this.add.container(this.width / 2, 34, [titleText, subPill, subtitleText]);
    this.tweens.add({
      targets: this.titleContainer,
      y: "+=3",
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // this.explanation = this.add.text(this.width/2, this.height*.55, this.explanationDevice, { fontSize: '17px', fontStyle: 'bold', fill: '#000' });
    // this.explanation.setOrigin(.5,.5)
    // this.explanation.setVisible(false);

    // 6. Polished Juicy Start Button (Call to Action)
    const btnW = 264;
    const btnH = 42;
    const btnRadius = 21;

    const btnBg = this.add.graphics();
    // Shadow
    btnBg.fillStyle(0x000000, 0.35);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2 + 3, btnW, btnH, btnRadius);
    // Base crimson fill
    btnBg.fillStyle(0xd90429, 1);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnRadius);
    // Upper glossy highlight
    btnBg.fillStyle(0xef233c, 0.9);
    btnBg.fillRoundedRect(-btnW / 2 + 2, -btnH / 2 + 2, btnW - 4, btnH / 2 - 2, { tl: btnRadius - 2, tr: btnRadius - 2, bl: 0, br: 0 });
    // Crisp border
    btnBg.lineStyle(2, 0xffffff, 0.95);
    btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnRadius);

    this.startTxt = this.add.text(0, 0, "▶  Toca para Jugar  ◀", {
      fontSize: "17px",
      fontFamily: 'system-ui, "Arial Black", sans-serif',
      fontStyle: "bold",
      color: "#FFFFFF",
      stroke: "#660708",
      strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(0,0,0,0.4)", blur: 2 }
    });
    this.startTxt.setOrigin(0.5, 0.5);

    this.startBtnContainer = this.add.container(this.width / 2, 230, [btnBg, this.startTxt]);
    this.tweens.add({
      targets: this.startBtnContainer,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    // 7. Subtle Controls Hint
    const controlsHint = this.add.text(this.width / 2, 270, "¡Inclina al borde y sacude para expulsar!", {
      fontSize: "11px",
      fontFamily: "system-ui, sans-serif",
      fontStyle: "500",
      color: "#E2F0D9",
      stroke: "#102A0C",
      strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 1, color: "#000000", blur: 3, fill: true }
    });
    controlsHint.setOrigin(0.5, 0.5);

    // 8. Saved High Score Badge (if present and localStorage available)
    let savedHighScore = 0;
    try {
      savedHighScore = parseInt(window?.localStorage?.getItem("highScore") || "0", 10) || 0;
    } catch {
      // Ignore when localStorage is blocked or unavailable
    }

    if (savedHighScore > 0) {
      const trophyBg = this.add.graphics();
      trophyBg.fillStyle(0x0a1c09, 0.8);
      trophyBg.lineStyle(1.5, 0xf6d365, 0.9);
      trophyBg.fillRoundedRect(this.width - 124, 8, 116, 22, 11);
      trophyBg.strokeRoundedRect(this.width - 124, 8, 116, 22, 11);

      const trophyText = this.add.text(this.width - 66, 19, `🏆 Récord: ${savedHighScore}`, {
        fontSize: "11px",
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
        color: "#FFE58F"
      });
      trophyText.setOrigin(0.5, 0.5);
    }

    // 9. Input handling with tactile feedback
    this.input.removeAllListeners();
    this.input.on("pointerdown", () => {
      this.startBtnContainer?.setScale(0.96);
    });
    this.input.once("pointerup", () => {
      this.startBtnContainer?.setScale(1.0);
      this.start();
    });
  }

  async start() {
    // Double taps (and any repeated pointerup) must not request fullscreen or start the game twice.
    if (this.isStarting) {
      return;
    }
    this.isStarting = true;
    screenWakeLock.acquire().catch(() => {});
    new GameAudio(this.sound).play(AUDIO_KEYS.uiTap);
    // Request iOS 13+ sensor permissions while still within the user gesture callback.
    await this.requestMotionPermissions();

    if (!this.scale.isFullscreen && this.scale.fullscreen.available) {
      this.scale.startFullscreen();
    }
    // Browsers only allow screen.orientation.lock() once the document is
    // really in fullscreen mode, and entering fullscreen is asynchronous.
    // Waiting for the fullscreenchange event avoids asking for the lock while
    // the request is still in flight, when it is guaranteed to be rejected.
    if (await this.waitForFullscreen()) {
      await this.tryOrientation();
    }
    
    this.startTxt.setVisible(false);
    this.startBtnContainer?.setVisible(false);
    this.scene.start("GameScene");
  }

  /**
   * Waits until the browser really enters fullscreen mode.
   *
   * Resolves to `true` once a fullscreen element is active, and to `false`
   * when the Fullscreen API is not available, the browser rejects the request
   * or nothing happens before the timeout, so the game never gets stuck.
   */
  private waitForFullscreen(timeoutMs = 3000): Promise<boolean> {
    if (this.scale.isFullscreen) {
      return Promise.resolve(true);
    }
    if (!this.scale.fullscreen.available) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const changeEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];
      const errorEvents = ["fullscreenerror", "webkitfullscreenerror", "mozfullscreenerror", "MSFullscreenError"];
      let timeoutId: number = undefined;

      const finish = (entered: boolean) => {
        window.clearTimeout(timeoutId);
        changeEvents.forEach((name) => document.removeEventListener(name, onChange));
        errorEvents.forEach((name) => document.removeEventListener(name, onError));
        resolve(entered);
      };
      const onChange = () => {
        // this.scale.isFullscreen follows the (possibly vendor prefixed)
        // fullscreen element of the document.
        if (this.scale.isFullscreen) {
          finish(true);
        }
      };
      const onError = () => finish(false);

      changeEvents.forEach((name) => document.addEventListener(name, onChange, false));
      errorEvents.forEach((name) => document.addEventListener(name, onError, false));
      // Never block the start of the game on a browser that stays silent.
      timeoutId = window.setTimeout(() => finish(this.scale.isFullscreen), timeoutMs);

      // The change may have happened between requesting fullscreen and
      // registering these listeners, so re-check instead of missing it.
      if (this.scale.isFullscreen) {
        finish(true);
      }
    });
  }

  /**
   * This method must to be called in fullscreen mode to work
   */
  private async tryOrientation() {
    const desiredOrientation = 'landscape-primary';
    // fail
    // @ts-ignore
    // ScreenOrientation.lock(desiredOrientation)
    // screen['mozOrientation'].lock(desiredOrientation);
    // screen.orientationLock(desiredOrientation);
    // window.screen.lockOrientation(desiredOrientation)
    // screen.lockOrientationUniversal(["landscape-primary", "landscape-secondary"])
    
    //do nothing
    // this.game.scale.orientation = desiredOrientation
    // this.scale.lockOrientation(desiredOrientation)
    // window.screen.mozLockOrientation(desiredOrientation)
    // await window.screen.orientation.lock(desiredOrientation);
    // screen.orientation.lock(desiredOrientation)	

    const screenAny = screen as unknown as {
      orientation?: { lock?: (orientation: string) => Promise<void> };
      mozOrientation?: { lock?: (orientation: string) => Promise<void> };
      msOrientation?: { lock?: (orientation: string) => Promise<void> };
      orientationLock?: (orientation: string) => Promise<void>;
    };
    const orientObj = screenAny.orientation ?? screenAny.mozOrientation ?? screenAny.msOrientation;
    try {
      if (typeof orientObj?.lock === "function") {
        await orientObj.lock(desiredOrientation);
      } else if (typeof screenAny.orientationLock === "function") {
        await screenAny.orientationLock(desiredOrientation);
      }
    } catch (e) {
      // Locking is best effort: desktop browsers, iOS Safari and non fullscreen
      // documents reject it. Now that fullscreen is confirmed, a rejection is
      // worth knowing about instead of swallowing it.
      console.warn("Could not lock the screen orientation to " + desiredOrientation, e);
    }
  }

  /**
   * Prompts for motion and orientation permissions on iOS 13+ devices.
   */
  private async requestMotionPermissions(): Promise<void> {
    const win = window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
    };
    if (typeof win.DeviceOrientationEvent?.requestPermission === "function") {
      try {
        await win.DeviceOrientationEvent.requestPermission();
      } catch (error) {
        console.warn("Could not obtain DeviceOrientationEvent permission", error);
      }
    }
    if (typeof win.DeviceMotionEvent?.requestPermission === "function") {
      try {
        await win.DeviceMotionEvent.requestPermission();
      } catch (error) {
        console.warn("Could not obtain DeviceMotionEvent permission", error);
      }
    }
  }
}
