import { Scene, Physics, GameObjects } from "phaser";
import { GameScene } from "../scenes/game-scene";
import { Food } from "./food";
import { MySprite } from "./mySprite";

/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic ants: Ant
 * @license      
 */
export class Ant extends MySprite {
    ANT_SPEED: number = 45;
    gravityFactor = 10;
    myFood: Food;
    isAlive: boolean;
    isClimbing: boolean;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'ant_sheet');

        this.setScale(0.5);
        this.setCircle(9, this.width / 4, this.height / 3)
    }

    init() {
        this.isAlive = true
        this.isClimbing = true
        this.enableBody(true,this.x,this.y,true,true)
        this.setRandomBorderPosition()
    }

    setRandomBorderPosition() {
        // this.setRandomPosition();
        let borderMargin = 10; // for not die borning outside the screen
        let x, y = borderMargin;
        let randomX = Phaser.Math.Between(borderMargin, this.scene.width - borderMargin)
        let randomY = Phaser.Math.Between(borderMargin, this.scene.height - borderMargin)
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                x = randomX
                break;
            case 1: // right border
                x = this.scene.width - borderMargin
                y = randomY
                break;
            case 2: // bottom border
                x = randomX
                y = this.scene.height - borderMargin
                break;
            case 3: // left border
                y = randomY
                break;
        }
        this.setPosition(x, y);
    }

    update() {
        if (this.scene.gameOver || !this.isAlive) {
            return
        }

        this.myFood = this.pickNearestFood()

        let xDistance = this.x - this.myFood.x
        let yDistance = this.y - this.myFood.y
        this.setVelocity(xDistance, yDistance);
        this.choseSpriteDirection(xDistance, yDistance);

        if (this.isClimbing && Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
            // the ant has reached the "tray"
            this.isClimbing = false;
        } else if (!this.isClimbing && !Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
            // ant has fallen
            this.kill()
            this.scene.antOut(this)
            this.scene.time.delayedCall(1000, () => {
                this.init();
            })
        }
    }

    kill() {
        this.isAlive = false
        this.isClimbing = false
        this.disableBody(false,true);
    }

    private choseSpriteDirection(xDistance: number, yDistance: number) {
        let xShouldWalkDir = this.x < this.myFood.x ? 'right' : 'left';
        let yShouldWalkDir = this.y < this.myFood.y ? 'down' : 'up';
        let shouldBeCurrentAnim: string = Math.abs(xDistance) < Math.abs(yDistance) ? yShouldWalkDir : xShouldWalkDir;
        if (this.anims.getCurrentKey() != 'walk_' + shouldBeCurrentAnim) {
            this.play('walk_' + shouldBeCurrentAnim);
        }
    }

    setVelocity(xDistance: number, yDistance?: number) {
        //TODO: if problems here try with setting angle and using 
        // physics gravity (now we are simulating gravity)
        // this.setAcceleration(
        // let xDistance = Math.abs(this.x-this.scene.food.x)
        // let yDistance = Math.abs(this.y-this.scene.food.y)
        let total = Math.abs(xDistance) + Math.abs(yDistance);
        let antSpeedX = (this.ANT_SPEED * -xDistance) / total + this.scene.gravity.x * this.gravityFactor;
        let antSpeedY = (this.ANT_SPEED * -yDistance) / total + this.scene.gravity.y * this.gravityFactor;
        this.setVelocityX(antSpeedX);
        this.setVelocityY(antSpeedY);
        return this
    }

    pickNearestFood(): Food {
        return <Food>this.scene.foods.getChildren().filter((f: Food) => f.body.enable).reduce(
            (prev: Food, curr: Food) => this.distanceAgainst(prev) < this.distanceAgainst(curr) ? prev : curr)
    }

    distanceAgainst(go: Phaser.GameObjects.Sprite) {
        return Phaser.Math.Distance.Between(this.x, this.y, go.x, go.y)
    }

    // eating() {
    //     if(this.myFood.body.enable){

    //     })
    // }

    antOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
