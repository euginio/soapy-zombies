/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies: Tile
 * @license      
 */

export class Tile extends Phaser.GameObjects.Image {
  constructor(params) {
    super(params.scene, params.x, params.y, params.key, params.frame);

    // set image settings
    this.setOrigin(0, 0);
    this.setInteractive();

    this.scene.add.existing(this);
  }
}
