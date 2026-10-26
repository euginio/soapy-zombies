import {
    calculateAntVelocity,
    calculateWormInchingScale,
    CATERPILLAR_GRAVITY_FACTOR,
    CATERPILLAR_SPEED,
    insetHorizontalTrayBounds,
    isWormTouchingFood,
    pickNearestTarget,
    rectanglesOverlap
} from "../game-rules";
import { GameScene } from "../scenes/game-scene";
import { Food } from "./food";
import { MySprite } from "./mySprite";

/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Picnic bugs: Caterpillar (Worm)
 * @license      
 */
export class Caterpillar extends MySprite {
    CATERPILLAR_SPEED = CATERPILLAR_SPEED;
    gravityFactor = CATERPILLAR_GRAVITY_FACTOR;
    myFood: Food | null = null;
    isAlive: boolean = false;
    isClimbing: boolean = false;
    isTouchingTray: boolean = false;
    private inchCycle: number = 0;
    private climbTimer: Phaser.Time.TimerEvent | null = null;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'caterpillar');
        this.setScale(0.24);
        this.init();
    }

    init() {
        if (this.scene.gameOver) {
            return;
        }
        this.isAlive = true;
        this.inchCycle = 0;
        this.setScale(0.24);
        this.enableBody(false, this.x, this.y, false, true);
        this.setRandomBorderPosition();
        this.faceCenter();
        this.climb();
    }

    private climb() {
        if (this.climbTimer) {
            this.climbTimer.remove(false);
            this.climbTimer = null;
        }
        this.isClimbing = true;
        this.climbTimer = this.scene.time.delayedCall(2000, () => {
            this.climbTimer = null;
            if (this.scene && !this.scene.gameOver && this.active && this.isAlive) {
                this.isClimbing = false;
            }
        });
    }

    setRandomBorderPosition() {
        const band = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        const edgeMargin = this.displayWidth / 2 + 4;
        let x = Phaser.Math.Between(band.x, band.x + band.width);
        let y = Phaser.Math.Between(band.y, band.y + band.height);
        switch (Phaser.Math.Between(0, 3)) {
            case 0:
                y = band.y;
                break;
            case 1:
                x = band.x + band.width - edgeMargin;
                break;
            case 2:
                y = band.y + band.height;
                break;
            case 3:
                x = band.x + edgeMargin;
                break;
        }
        this.setPosition(x, y);
    }

    update(_time?: number, delta: number = 16) {
        if (this.scene.gameOver || !this.isAlive || this.isClimbing) {
            return;
        }

        this.myFood = this.pickNearestFood();
        if (this.myFood) {
            this.faceMyFood();
            const xDistance = this.x - this.myFood.x;
            const yDistance = this.y - this.myFood.y;
            this.setVelocity(xDistance, yDistance);

            this.inchCycle += delta;
            const inch = calculateWormInchingScale(this.inchCycle);
            this.setScale(0.24 * inch.scaleX, 0.24 * inch.scaleY);
        } else {
            this.setVelocity(0, 0);
        }

        const trayOverlapBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        this.isTouchingTray = rectanglesOverlap(trayOverlapBounds, this.getBounds());
        if (!this.isTouchingTray) {
            this.kill();
        }
    }

    private faceCenter() {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.scene.width / 2, this.scene.height / 2);
        this.setAngle(Phaser.Math.RadToDeg(angle) + 90);
    }

    private faceMyFood() {
        if (!this.myFood) {
            return;
        }
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.myFood.x, this.myFood.y);
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
        this.scene.wormDied(this);

        const spinDirection = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        this.scene.tweens.add({
            targets: this,
            scale: { value: 0.01, duration: 750, ease: 'Power2' },
            angle: { value: this.angle + spinDirection * 540, duration: 750, ease: 'Power2' },
            yoyo: true,
            loop: 0,
            onYoyo: () => {
                this.disableBody(false, true);
            },
            onComplete: () => {
                if (this.scene && !this.scene.gameOver && this.active) {
                    this.init();
                }
            }
        });
    }

    destroy(fromScene?: boolean) {
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
        }
        if (this.climbTimer) {
            this.climbTimer.remove(false);
            this.climbTimer = null;
        }
        super.destroy(fromScene);
    }

    setVelocity(xDistance: number, yDistance?: number) {
        const velocity = calculateAntVelocity(
            xDistance,
            yDistance ?? 0,
            this.CATERPILLAR_SPEED,
            this.scene.gravity.x,
            this.scene.gravity.y,
            this.gravityFactor
        );
        this.setVelocityX(velocity.x);
        this.setVelocityY(velocity.y);
        return this;
    }

    pickNearestFood(): Food | null {
        const availableFood = (this.scene.foods.getChildren() as Food[])
            .filter((food: Food) => food.active && food.body && food.body.enable && !food.isBeingDragged && !food.isBeingCarried);
        if (
            this.myFood &&
            this.myFood.active &&
            this.myFood.body &&
            this.myFood.body.enable &&
            !this.myFood.isBeingDragged &&
            !this.myFood.isBeingCarried &&
            isWormTouchingFood({ x: this.x, y: this.y }, { x: this.myFood.x, y: this.myFood.y }, 46)
        ) {
            return this.myFood;
        }
        return pickNearestTarget(this.x, this.y, availableFood);
    }
}
