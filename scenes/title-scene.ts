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

    var bg = this.add.sprite(this.width/2, this.height/2, 'grass');
    bg.setScale(2.3)

    var title = this.add.text(this.width/2, this.height/4, '¡Ants Feast!', {fontSize: '48px', fontStyle: 'bold', color: '#123'});
    title.setOrigin(.5,.5)
    // this.explanation = this.add.text(this.width/2, this.height*.55, this.explanationDevice, { fontSize: '17px', fontStyle: 'bold', fill: '#000' });
    // this.explanation.setOrigin(.5,.5)
    // this.explanation.setVisible(false);

    this.startTxt = this.add.text(this.width/2, this.height*0.75, 'Toca la pantalla para comenzar', {fontSize: '29px', fontStyle: 'bold', color: '#32F'});
    this.startTxt.setOrigin(.5,.5)

    this.input.on('pointerup', () => this.start());
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
    this.scene.start('GameScene');
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
