/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic ants: Title Scene
 * @license      
 */

import { MyScene } from "./my-scene";

export class TitleScene extends MyScene {
  private loadingBar: Phaser.GameObjects.Graphics;
  private progressBar: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "TitleScene" });
  }

  create() {
    let explanationDevice = 'inclinando el celular en diferentes sentidos'
    if (this.sys.game.device.os.desktop) {
      explanationDevice = 'con las flechas del teclado'
    }

    var bg = this.add.sprite(this.width/2, this.height/2, 'graveyard');
    bg.setScale(2.3)

    var title = this.add.text(this.width/2, this.height/4, '¡Hormigas de Picnic!', {fontSize: '33px', fontStyle: 'bold', fill: '#A73'});
    title.setOrigin(.5,.5)
    var explanation = this.add.text(this.width/2, this.height*.55,
      `      ¡Haz que se caigan las hormigas 
      ${explanationDevice}!`, { fontSize: '19px', fontStyle: 'bold', fill: '#000' });
    explanation.setOrigin(.5,.5)

    var startTxt = this.add.text(this.width/2, this.height*0.75, '¡Toca la pantalla para comenzar!', {fontSize: '24px', fontStyle: 'bold', fill: '#32F'});
    startTxt.setOrigin(.5,.5)

    this.input.on('pointerup', () => this.start());
  }

  async start() {
    if (!this.scale.isFullscreen) {
      this.scale.startFullscreen();
    }
    await this.tryOrientation();
    this.scene.start('GameScene')
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
