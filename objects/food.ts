import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic ants: Ant
 * @license      
 */
export class Ant extends Physics.Arcade.Sprite {
    ANT_SPEED: number = 45;
    body: Physics.Arcade.Body;
    scene: GameScene;
    gravityFactor = 10;

    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene: GameScene) {
        super(scene, 0, 0, 'ant_sheet');


        // scene.add.existing(this);
        scene.physics.add.existing(this);
        // this.scene.physics.moveToObject(this,this.scene.food, Phaser.Math.Between(12,60))

        // this.setAngle

        //  this.body.allowGravity = true;
        // this.setCollideWorldBounds()

        this.initAnt();
    }
    initAnt() {
        // this.setRandomPosition();
        let x, y = 0;
        let randomX = Phaser.Math.Between(0, this.scene.width)
        let randomY = Phaser.Math.Between(0, this.scene.height)
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                x = randomX
                break;
            case 1: // right border
                x = this.scene.width
                y = randomY
                break;
            case 2: // bottom border
                x = randomX
                y = this.scene.height
                break;
            case 3: // left border
                y = randomY
                break;
        }
        this.setPosition(x, y);

    }

    // setRandomPosition(){
    //     this.x = Phaser.Math.Between(0, this.scene.width)
    //     this.y = Phaser.Math.Between(0, this.scene.height)
    // }

    public static newRandomAnt(scene: GameScene) {
        // var aDirection = Math.abs(Math.random() * 4 * 90);
        var newAnt: Ant;
        newAnt = new Ant(scene);
        return newAnt;
    }

    update() {
        // this.setAcceleration(
        //     (-(this.x-this.scene.food.x)/10)+this.scene.gravity.x,
        //     (-(this.y-this.scene.food.y)/10)+this.scene.gravity.y
        //     // (-(this.x-this.scene.food.x)/10),
        //     // (-(this.y-this.scene.food.y)/10)
        // );
        // this.setVelocity(this.ANT_SPEED)

        // let xDistance = Math.abs(this.x-this.scene.food.x)
        // let yDistance = Math.abs(this.y-this.scene.food.y)

        //TODO: if problems here try with setting angle and using 
        // physics gravity (now we are simulating gravity)
        let xDistance = this.x - this.scene.food.x
        let yDistance = this.y - this.scene.food.y
        let total = Math.abs(xDistance) + Math.abs(yDistance)

        let antSpeedX = (this.ANT_SPEED * -xDistance) / total + this.scene.gravity.x * this.gravityFactor
        let antSpeedY = (this.ANT_SPEED * -yDistance) / total + this.scene.gravity.y * this.gravityFactor

        this.setVelocityX(antSpeedX)
        this.setVelocityY(antSpeedY)

        let xShouldWalkDir = this.x<this.scene.food.x? 'right': 'left'
        let yShouldWalkDir = this.y<this.scene.food.y? 'down': 'up'
        let shouldBeCurrentAnim:string = Math.abs(xDistance) < Math.abs(yDistance)? yShouldWalkDir: xShouldWalkDir
        if (this.anims.getCurrentKey() != 'walk_'+shouldBeCurrentAnim) {
            this.play('walk_'+shouldBeCurrentAnim);
        }

        if (!Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
            this.scene.antOut(this)
        }

    }

    eatFood() {

    }

    antOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
