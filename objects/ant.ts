import { Scene, Physics, GameObjects } from "phaser";
import {
  calculateAntVelocity,
  insetHorizontalTrayBounds,
  pickNearestTarget,
  rectanglesOverlap
} from "../game-rules";
import { GameScene } from "../scenes/game-scene";
import { Food } from "./food";
import { MySprite } from "./mySprite";

/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Ants Feast: Ant
 * @license      
 */
export class Ant extends MySprite {
    
    ANT_SPEED: number = 55;
    debugColor: string | null = null;
    gravityFactor = 10;
    myFood: Food | null = null;
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
        this.enableBody(false, this.x, this.y, false, true)
        this.setRandomBorderPosition()
        
        this.faceCenter();
        this.play('walk');

        this.climb();
        // this.setScale(1)
    }

    private climb() {
        this.isClimbing = true;
        this.scene.time.delayedCall(1500, () => {
            this.isClimbing = false;
        })
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
        if (this.scene.gameOver || !this.isAlive || this.isClimbing) {
            return
        }

        this.myFood = this.pickNearestFood();
        if (this.myFood) {
            this.faceMyFood();
            let xDistance = this.x - this.myFood.x;
            let yDistance = this.y - this.myFood.y;
            this.setVelocity(xDistance, yDistance);
        } else {
            this.setVelocity(0, 0);
        }
        // this.choseSpriteDirection(xDistance, yDistance);

        // this.setAngle(Phaser.Math.RadToDeg(this.body.angle)+90)

        const trayOverlapBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        this.isTouchingTray = rectanglesOverlap(trayOverlapBounds, this.getBounds());
        if (this.isClimbing && this.isTouchingTray) {
            // the ant has reached the "tray"
            this.isClimbing = false;
        } else if (!this.isClimbing && !this.isTouchingTray) {
            // ant has fallen
            this.kill()
        }
    }

    private faceCenter() {
        let angle = Phaser.Math.Angle.Between(this.x, this.y, this.scene.width/2, this.scene.height/2);
        this.setAngle(Phaser.Math.RadToDeg(angle) + 90);
    }

    private faceMyFood() {
        if (!this.myFood) {
            return;
        }
        let angle = Phaser.Math.Angle.Between(this.x, this.y, this.myFood.x, this.myFood.y);
        this.setAngle(Phaser.Math.RadToDeg(angle) + 90);
    }

    kill() {
        this.isAlive = false
        this.isClimbing = false
        this.setImmovable(true);
        this.disableBody(false, false)
        this.scene.antDied(this)
        
        this.scene.tweens.add({targets:this, 
            scale: { value: 0.01, duration: 750},
            yoyo:true, loop:0,
            onYoyo:()=>{
                this.disableBody(false, true)
            },
            onComplete:()=>{
                this.init();
            }
        })

    }

    // private choseSpriteDirection(xDistance: number, yDistance: number) {
        // let xShouldWalkDir = this.x < this.myFood.x ? 'right' : 'left';
        // let yShouldWalkDir = this.y < this.myFood.y ? 'down' : 'up';
        // let shouldBeCurrentAnim: string = Math.abs(xDistance) < Math.abs(yDistance) ? yShouldWalkDir : xShouldWalkDir;
        // if (this.anims.getCurrentKey() != 'walk_' + shouldBeCurrentAnim) {
        //     this.play('walk_' + shouldBeCurrentAnim);
        // }
    // }

    setVelocity(xDistance: number, yDistance?: number) {
        //TODO: if problems here try with setting angle and using 
        // physics gravity (now we are simulating gravity)
        // this.setAcceleration(
        // let xDistance = Math.abs(this.x-this.scene.food.x)
        // let yDistance = Math.abs(this.y-this.scene.food.y)
        const velocity = calculateAntVelocity(
            xDistance,
            yDistance ?? 0,
            this.ANT_SPEED,
            this.scene.gravity.x,
            this.scene.gravity.y,
            this.gravityFactor
        );
        this.setVelocityX(velocity.x);
        this.setVelocityY(velocity.y);
        return this
    }

    pickNearestFood(): Food | null {
        const availableFood = this.scene.foods.getChildren()
            .filter((food: Food) => food.body.enable) as Food[];
        return pickNearestTarget(this.x, this.y, availableFood);
    }

    // eating() {
    //     if(this.myFood.body.enable){

    //     })
    // }

    antOut() {
        
    }
}
