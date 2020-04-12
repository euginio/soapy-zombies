/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic ants: Boot Scene
 * @license      
 */

export abstract class MyScene extends Phaser.Scene {
  width: number;
  height: number;

  constructor(obj) {
    super(obj);
  }
  
  init(){
    this.width = <number>this.game.config.width
    this.height = <number>this.game.config.height
  }


}
