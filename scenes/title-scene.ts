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
  explanationDevice: string;
  explanation: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TitleScene" });
  }

  create() {
    this.explanationDevice = 'inclinando el celular en diferentes sentidos'
    if (this.sys.game.device.os.desktop) {
      this.explanationDevice = 'con las flechas del teclado'
    }
    this.explanationDevice = `    ¡Defiende la comida de las hormigas
     haciendo que se caigan de la bandeja 
     ${this.explanationDevice}!`

    var bg = this.add.sprite(this.width/2, this.height/2, 'grass');
    bg.setScale(2.3)

    var title = this.add.text(this.width/2, this.height/4, '¡Ants Feast!', {fontSize: '33px', fontStyle: 'bold', fill: '#423'});
    title.setOrigin(.5,.5)
    this.explanation = this.add.text(this.width/2, this.height*.55, this.explanationDevice, { fontSize: '17px', fontStyle: 'bold', fill: '#000' });
    this.explanation.setOrigin(.5,.5)
    this.explanation.setVisible(false);

    this.startTxt = this.add.text(this.width/2, this.height*0.75, '¡Toca la pantalla para comenzar!', {fontSize: '24px', fontStyle: 'bold', fill: '#32F'});
    this.startTxt.setOrigin(.5,.5)

    this.input.on('pointerup', () => this.start());
  }

  async start() {
    if (!this.scale.isFullscreen) {
      this.scale.startFullscreen();
    }
    // this.startTxt.setText(this.explanationDevice)
    this.explanation.setVisible(true);
    this.startTxt.setVisible(false);

    await this.tryOrientation();
    this.time.delayedCall(7000, () => this.scene.start('GameScene'))
  }

  /**
   * This method must to be called in fullscreen mode to work
   */
  private async tryOrientation() {
    const desiredOrientation = 'landscape-primary';
    // @ts-ignore
    // ScreenOrientation.lock(orientation)
    // this.game.scale.orientation = orientation
    // this.scale.lockOrientation(orientation)
    // window.screen.orientation.lock(orientation);
    // screen.orientation.lock(orientation)	

    var orientKey = 'orientation';
    if ('mozOrientation' in screen) {
      orientKey = 'mozOrientation';
    } else if ('msOrientation' in screen) {
      orientKey = 'msOrientation';
    }
    var promise = null;
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
