import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";
import { MySprite } from "./mySprite";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic foods: Food
 * @license      
 */
export class Food extends MySprite {
    gravityFactor = .2;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'food');

        this.body.immovable = true;
        this.setScale(0.5);
        // this.setSize(this.width/3, this.height/3)
        // this.setOffset(17)
        this.setCircle(23, 12, 7)

        this.on('animationcomplete', this.destroy, this);
    }

    init() {
        this.setRandomPosition(this.scene.width * 0.2, this.scene.height * 0.2, this.scene.width * .6, this.scene.height * .6);
    }

    destroy(animation?) {
        if (this.body.enable) {
            this.scene.destroyFood(this)
            // this.scene.time.delayedCall(1500, () => {
            this.disableBody(false, true);
            // })
        }
    }
    update() {
        // if(this.body.enable){

        //     this.setGravityX(this.scene.gravity.x * this.gravityFactor)
        //     this.setGravityY(this.scene.gravity.y * this.gravityFactor)

        //     if (!Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
        //         this.scene.foodOut(this)
        //     }
        // }
    }

    beingEat() {
        if (this.body.enable && !this.anims.isPlaying) {
            this.play('eatingFood');
        }
    }

    foodOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
