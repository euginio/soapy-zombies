import {
    calculateAntVelocity,
    canAntStealFood,
    clampFoodPosition,
    insetHorizontalTrayBounds,
    isFoodInsideTray,
    MAX_CARRIER_ANTS,
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
    carriedFood: Food | null = null;
    isAlive: boolean;
    isClimbing: boolean;
    isTouchingTray: boolean;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'ant_sheet');

        this.setScale(0.2);
        // this.setCircle(9, this.width / 4, this.height / 3)
        this.init();
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

    stealFood(food: Food): boolean {
        if (!canAntStealFood(
            this.isAlive,
            this.isClimbing,
            Boolean(this.carriedFood),
            food.carrierCount,
            Boolean(food.isBeingDragged),
            Boolean(food.isBeingEaten),
            Boolean(food.body?.enable)
        )) {
            return false;
        }
        this.carriedFood = food;
        return food.addCarrier(this);
    }

    dropFood(returnToTray = true) {
        if (!this.carriedFood) {
            return;
        }
        const food = this.carriedFood;
        this.carriedFood = null;
        food.removeCarrier(this);
        if (food.carrierCount === 0 && returnToTray) {
            food.dropFoodOnTray();
        }
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
        let x = Phaser.Math.Between(band.x, band.x + band.width);
        let y = Phaser.Math.Between(band.y, band.y + band.height);
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                y = band.y;
                break;
            case 1: // right border
                x = band.x + band.width - edgeMargin;
                break;
            case 2: // bottom border
                y = band.y + band.height;
                break;
            case 3: // left border
                x = band.x + edgeMargin;
                break;
        }
        this.setPosition(x, y);
    }

    update() {
        if (this.scene.gameOver || !this.isAlive || this.isClimbing) {
            return;
        }

        if (this.carriedFood) {
            if (!this.carriedFood.active || this.carriedFood.isBeingEaten) {
                this.dropFood(false);
                return;
            }
            // Food.update() handles collective movement and positioning of all carrier ants
            return;
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

        // The inset bounds create a narrow edge where an ant counts as having fallen.
        const trayOverlapBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        this.isTouchingTray = rectanglesOverlap(trayOverlapBounds, this.getBounds());
        // Climbing ants returned early above, so reaching this point means the ant is on its own.
        if (!this.isTouchingTray) {
            // ant has fallen
            this.kill();
        }
    }

    private faceCenter() {
        let angle = Phaser.Math.Angle.Between(this.x, this.y, this.scene.width / 2, this.scene.height / 2);
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
        if (this.carriedFood) {
            const food = this.carriedFood;
            this.carriedFood = null;
            food.removeCarrier(this);
            if (food.carrierCount === 0) {
                const trayBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
                if (isFoodInsideTray(food.x, food.y, trayBounds)) {
                    food.dropFoodOnTray();
                } else {
                    if (food.body && food.body.enable) {
                        this.scene.destroyFood(food);
                        food.disableBody(true, true);
                        food.destroy();
                    }
                }
            }
        }

        this.isAlive = false;
        this.isClimbing = false;
        this.setImmovable(true);
        this.disableBody(false, false);
        // Report the escape once, then animate the ant before returning it to the tray.
        this.scene.antDied(this);
        
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
                if (this.scene && !this.scene.gameOver) {
                    this.init();
                }
            }
        });
    }

    destroy(fromScene?: boolean) {
        if (this.carriedFood) {
            this.carriedFood.removeCarrier(this);
            this.carriedFood = null;
        }
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
        }
        super.destroy(fromScene);
    }

    setVelocity(xDistance: number, yDistance?: number) {
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
        return this;
    }

    pickNearestFood(): Food | null {
        const availableFood = this.scene.foods.getChildren()
            .filter((food: Food) => food.body && food.body.enable && !food.isBeingDragged && food.carrierCount < MAX_CARRIER_ANTS && !food.isBeingEaten) as Food[];
        return pickNearestTarget(this.x, this.y, availableFood);
    }
}
