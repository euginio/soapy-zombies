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
    
    ANT_SPEED: number = 55;
    gravityFactor = 10;
    myFood: Food;
    isAlive: boolean;
    isClimbing: boolean;
    isTouchingTray: boolean;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'ant_sheet');

        this.setScale(0.2);
        // this.setCircle(9, this.width / 4, this.height / 3)
    }

    init() {
        this.isAlive = true
        this.isClimbing = true
        this.enableBody(false, this.x, this.y, false, true)
        this.setRandomBorderPosition()

        // this.setScale(1)
    }

    setRandomBorderPosition() {
        let trayB= this.scene.tray.getBounds()
        // this.setRandomPosition();
        let randomX, x = Phaser.Math.Between(trayB.left, trayB.right)
        let randomY, y = Phaser.Math.Between(trayB.top,trayB.bottom)
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                y = trayB.top
                break;
            case 1: // right border
                x = trayB.right-15
                break;
            case 2: // bottom border
                y = trayB.bottom
                break;
            case 3: // left border
                x = trayB.left+15
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

        // this.setAngle(Phaser.Math.RadToDeg(this.body.angle)+90)
        let angle = Phaser.Math.Angle.Between(this.x,this.y,this.myFood.x,this.myFood.y)
        this.setAngle(Phaser.Math.RadToDeg(angle)+90)

        let b=this.scene.tray.getBounds()
        b.setSize(b.width-50,b.height)
        b.setPosition(b.x+25,b.y)
        this.isTouchingTray=Phaser.Geom.Rectangle.Overlaps(b, this.getBounds())
        if (this.isClimbing && this.isTouchingTray) {
            // the ant has reached the "tray"
            this.isClimbing = false;
        } else if (!this.isClimbing && !this.isTouchingTray) {
            // ant has fallen
            this.kill()
        }
    }

    kill() {
        this.isAlive = false
        this.isClimbing = false
        this.setImmovable(true);
        this.disableBody(false, false)
        
        this.scene.tweens.add({targets:this, 
            scale: { value: 0.01, duration: 750},
            yoyo:true, loop:0,
            onYoyo:()=>{
                this.disableBody(false, true)
                this.scene.antDied(this)
            },
            onComplete:()=>{
                this.init();
            }
        })

    }

    private choseSpriteDirection(xDistance: number, yDistance: number) {
        // let xShouldWalkDir = this.x < this.myFood.x ? 'right' : 'left';
        // let yShouldWalkDir = this.y < this.myFood.y ? 'down' : 'up';
        // let shouldBeCurrentAnim: string = Math.abs(xDistance) < Math.abs(yDistance) ? yShouldWalkDir : xShouldWalkDir;
        // if (this.anims.getCurrentKey() != 'walk_' + shouldBeCurrentAnim) {
        //     this.play('walk_' + shouldBeCurrentAnim);
        // }
        if (this.anims.getCurrentKey() != 'walk') {
            this.play('walk');
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
