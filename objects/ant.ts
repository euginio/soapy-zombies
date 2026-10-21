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
        if (this.scene.gameOver) {
            return;
        }
        this.isAlive = true;
        this.setScale(0.2);
        this.enableBody(false, this.x, this.y, false, true);
        this.setRandomBorderPosition();
        
        this.faceCenter();
        this.play('walk');

        this.climb();
        // this.setScale(1)
    }

    private climb() {
        this.isClimbing = true;
        this.scene.time.delayedCall(1500, () => {
            if (this.scene && !this.scene.gameOver) {
                this.isClimbing = false;
            }
        });
    }

    setRandomBorderPosition() {
        // Spawn along the tray border but inside the horizontally inset bounds:
        // the outer 25px edge band lies outside the inset used to detect falls,
        // so ants born there were instantly scored as escaped.
        // NB: this is a plain Rect (x/y/width/height), not a Phaser Rectangle.
        const band = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        // Half of the scaled ant width plus a margin keeps the body overlapping the band.
        const edgeMargin = this.displayWidth / 2 + 4;
        let x = Phaser.Math.Between(band.x, band.x + band.width)
        let y = Phaser.Math.Between(band.y, band.y + band.height)
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                y = band.y
                break;
            case 1: // right border
                x = band.x + band.width - edgeMargin
                break;
            case 2: // bottom border
                y = band.y + band.height
                break;
            case 3: // left border
                x = band.x + edgeMargin
                break;
        }
        this.setPosition(x, y);
    }

    update() {
        if (this.scene.gameOver || !this.isAlive || this.isClimbing) {
            return
        }

        // Re-select each frame so ants can react when food is eaten or moved.
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

        // The inset bounds create a narrow edge where an ant counts as having fallen.
        const trayOverlapBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        this.isTouchingTray = rectanglesOverlap(trayOverlapBounds, this.getBounds());
        // Climbing ants returned early above, so reaching this point means the ant is on its own.
        if (!this.isTouchingTray) {
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
        if (!this.isAlive || this.scene.gameOver) {
            return;
        }
        this.isAlive = false;
        this.isClimbing = false;
        this.setImmovable(true);
        this.disableBody(false, false);
        // Report the escape once, then animate the ant before returning it to the tray.
        this.scene.antDied(this);
        
        this.scene.tweens.add({
            targets: this, 
            scale: { value: 0.01, duration: 750 },
            yoyo: true,
            loop: 0,
            onYoyo: () => {
                this.disableBody(false, true);
            },
            onComplete: () => {
                if (this.scene && !this.scene.gameOver) {
                    this.init();
                }
            }
        });
    }

    destroy(fromScene?: boolean) {
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
        }
        super.destroy(fromScene);
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
        // Pursuit and tray gravity are combined here; gravity itself is managed by the scene.
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
            .filter((food: Food) => food.body && food.body.enable) as Food[];
        return pickNearestTarget(this.x, this.y, availableFood);
    }

    // eating() {
    //     if(this.myFood.body.enable){

    //     })
    // }
}
