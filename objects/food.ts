import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic foods: Food
 * @license      
 */
export class Food extends Physics.Arcade.Sprite {
    body: Physics.Arcade.Body;
    scene: GameScene;
    gravityFactor = .3;

    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene: GameScene) {
        super(scene, 0, 0, 'food');

        // scene.add.existing(this);
        scene.physics.add.existing(this);
        // this.scene.physics.moveToObject(this,this.scene.food, Phaser.Math.Between(12,60))

        // this.setAngle

        //  this.body.allowGravity = true;
        // this.setCollideWorldBounds()


        // this.body.immovable = true;
        this.setScale(0.35);
        // this.setSize(this.width/3, this.height/3)
        // this.setOffset(17)
        // this.setCircle(10,23,15)

        this.on('animationcomplete', this.destroy, this);

        this.init();
    }

    init() {
        this.setRandomPosition(this.scene.width*0.2, this.scene.height*0.2, this.scene.width*.6,this.scene.height*.6);
    }
    destroy(animation?){
        if(this.body.enable){
            this.disableBody(false,true);
            this.scene.destroyFood(this)
        }
    }
    update() {
        if(this.body.enable){

            this.setGravityX(this.scene.gravity.x * this.gravityFactor)
            this.setGravityY(this.scene.gravity.y * this.gravityFactor)
            
            if (!Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
                this.scene.foodOut(this)
            }
        }
    }

    eatFood() {

    }

    foodOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
