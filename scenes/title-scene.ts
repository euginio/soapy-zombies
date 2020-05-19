/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Ants Feast: Title Scene
 * @license      
 */

import { MyScene } from "./my-scene";

export class TitleScene extends MyScene {
  private loadingBar: Phaser.GameObjects.Graphics;
  private progressBar: Phaser.GameObjects.Graphics;
  startTxt: Phaser.GameObjects.Text;
  // explanationDevice: string;
  explanation: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TitleScene" });
  }

  create() {
    // this.explanationDevice = 'inclinando el celular en diferentes sentidos'
    // if (this.sys.game.device.os.desktop) {
    //   this.explanationDevice = 'con las flechas del teclado'
    // }
    // this.explanationDevice = `    ¡Defiende la comida de las hormigas
    //  haciendo que se caigan de la bandeja 
    //  ${this.explanationDevice}!`

    var bg = this.add.sprite(this.width/2, this.height/2, 'grass');
    bg.setScale(2.3)

    var title = this.add.text(this.width/2, this.height/4, '¡Ants Feast!', {fontSize: '48px', fontStyle: 'bold', fill: '#123'});
    title.setOrigin(.5,.5)
    // this.explanation = this.add.text(this.width/2, this.height*.55, this.explanationDevice, { fontSize: '17px', fontStyle: 'bold', fill: '#000' });
    // this.explanation.setOrigin(.5,.5)
    // this.explanation.setVisible(false);

    this.startTxt = this.add.text(this.width/2, this.height*0.75, '¡Touch screen to start', {fontSize: '29px', fontStyle: 'bold', fill: '#32F'});
    this.startTxt.setOrigin(.5,.5)

    this.input.on('pointerup', () => this.start());
  }

  async start() {
    if (!this.scale.isFullscreen) {
      this.scale.startFullscreen();
    }
    await this.tryOrientation();
    
    if(navigator.userAgent.indexOf("Chrome") != -1){
      this.startTxt.setVisible(false);
      this.scene.start('GameScene');
    }else{
      this.startTxt.setText(`Browser not supported
please use Chrome`); //do not change that indentation, it is on purpose
    }
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

    var orientKey = 'orientation';
    if ('mozOrientation' in screen) {
      orientKey = 'mozOrientation';
    } else if ('msOrientation' in screen) {
      orientKey = 'msOrientation';
    }
    // var promise = null;
    try {
      if (screen[orientKey].lock) {
        // promise = screen[orientKey].lock(screen[orientKey].type); // this lock in current orientation
        await screen[orientKey].lock(desiredOrientation);
      } else {
        // @ts-ignore
        // promise = screen.orientationLock(screen[orientKey]); // this lock in current orientation
        await screen.orientationLock(desiredOrientation);
      }
    }catch(e){
    }
  }
}
