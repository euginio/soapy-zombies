import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic mySprites: MySprite
 * @license      
 */
export abstract class MySprite extends Physics.Arcade.Sprite {
    body: Physics.Arcade.Body;
    scene: GameScene;

    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene: GameScene, x, y, texture) {
        super(scene, x, y, texture);

        // scene.add.existing(this);
        scene.physics.add.existing(this);
        // this.scene.physics.moveToObject(this,this.scene.mySprite, Phaser.Math.Between(12,60))

        //  this.body.allowGravity = true;
        // this.setCollideWorldBounds()

        // this.body.immovable = true;
        // this.setSize(this.width/3, this.height/3)
        // this.setOffset(17)
        this.init()
    }

    abstract init();

}
