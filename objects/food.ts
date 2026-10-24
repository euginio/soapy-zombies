import {
    areFoodsOverlapping,
    canFoodBeDragged,
    canFoodBeEaten,
    clampFoodPosition,
    FOOD_DRAG_COOLDOWN_MS,
    FOOD_MAX_DRAG_MS,
    resolveFoodDropPosition
} from "../game-rules";
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
    isBeingEaten: boolean = false;
    isBeingDragged: boolean = false;
    isDragCooldown: boolean = false;
    dragOffsetX: number = 0;
    dragOffsetY: number = 0;
    dragOriginX: number = 0;
    dragOriginY: number = 0;
    private dragHoldTimer: Phaser.Time.TimerEvent | null = null;
    private dragCooldownTimer: Phaser.Time.TimerEvent | null = null;

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'food');
        
        this.body.immovable = true;
        this.setScale(1.5);
        // this.setSize(this.width/3, this.height/3)
        // this.setOffset(17)
        this.setCircle(10,7,8)

        this.setFrame(Phaser.Math.Between(0, 24));
        this.setupDragAndDrop();

        // this.on('animationcomplete', this.destroy, this);
        this.init();
    }

    init() {
        this.clearDragTimers();
        this.resetInputDragState();
        this.isBeingDragged = false;
        this.isDragCooldown = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragOriginX = this.x;
        this.dragOriginY = this.y;
        this.setAlpha(1);
        this.setDepth(0);
        this.isBeingEaten = false;
        this.setScale(1.5);
        this.placeInTray()
    }
    
    placeInTray(){
        // Keep food away from the tray's edges and avoid spawning on top of existing food.
        let tray = this.scene.tray
        let trayB=tray.getBounds()
        let margin= 40
        const existingFoods = (this.scene.foods?.getChildren() ?? []).filter(
            (other): other is Food => other !== this && Boolean((other as Food).body?.enable)
        );
        const trayCenter = { x: this.scene.width / 2, y: this.scene.height / 2 };
        const maxAttempts = 30;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.setRandomPosition(trayB.left+margin, trayB.top+margin*2, trayB.right-trayB.left-margin*2, trayB.bottom-margin*4);
            const overlapsExisting = existingFoods.some((other) =>
                areFoodsOverlapping(this, other)
            );
            const overlapsCenter = areFoodsOverlapping(this, trayCenter, 36);
            if (!overlapsExisting && !overlapsCenter) {
                break;
            }
        }
        if (this.body) {
            this.body.reset(this.x, this.y);
        }
        this.dragOriginX = this.x;
        this.dragOriginY = this.y;
    }

    destroy(fromScene?: boolean) {
        this.clearDragTimers();
        this.resetInputDragState();
        this.isBeingDragged = false;
        this.isDragCooldown = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        if (this.scene?.tweens) {
            this.scene.tweens.killTweensOf(this);
        }
        this.isBeingEaten = false;

        if (fromScene) {
            super.destroy(fromScene);
            return;
        }

        // Count food only when an active piece is eaten, not during scene cleanup.
        if (this.body && this.body.enable) {
            this.scene.destroyFood(this);
            this.disableBody(true, true);
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
        if (canFoodBeEaten(this.isBeingEaten, this.isBeingDragged, this.body?.enable ?? false)) {
            this.clearDragTimers();
            this.resetInputDragState();
            this.isDragCooldown = false;
            this.setAlpha(1);
            this.isBeingEaten = true;
            this.emitCrumbs();
            this.scene.time.delayedCall(400, () => {
                if (this.scene && !this.scene.gameOver && this.isBeingEaten) {
                    this.emitCrumbs();
                }
            });
            // Guard against multiple collision callbacks starting duplicate eat animations.
            // Combine scale shrink and nibble wiggle in a single tween so tween counting remains exact.
            this.scene.tweens.add({
                targets: this, 
                scale: { value: 0, duration: 1500, ease: 'Power1' },
                angle: { value: '+=12', duration: 110, yoyo: true, repeat: 6, ease: 'Sine.easeInOut' },
                yoyo: false,
                loop: 0,
                onComplete: () => this.destroy()
            });
        }
    }

    private setupDragAndDrop() {
        this.setInteractive({ draggable: true, useHandCursor: true });

        this.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer && pointer.button !== 0 && pointer.button !== undefined) {
                return;
            }
            this.startDrag(pointer);
        });

        this.on('dragstart', (pointer: Phaser.Input.Pointer) => {
            this.startDrag(pointer);
        });

        this.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            this.moveDrag(dragX, dragY);
        });

        this.on('dragend', (pointer: Phaser.Input.Pointer) => {
            this.finishDrag(pointer);
        });

        this.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            this.finishDrag(pointer);
        });
    }

    startDrag(pointer?: Phaser.Input.Pointer): boolean {
        if (this.isBeingDragged) {
            return true;
        }
        if (
            !canFoodBeDragged(
                this.isBeingEaten,
                this.isDragCooldown,
                this.body?.enable ?? false,
                Boolean(this.scene?.gameOver)
            )
        ) {
            this.resetInputDragState(pointer);
            return false;
        }
        if (this.scene?.isAnyFoodDragging()) {
            this.resetInputDragState(pointer);
            return false;
        }
        this.isBeingDragged = true;
        this.dragOriginX = this.x;
        this.dragOriginY = this.y;
        const pointerX = pointer ? pointer.x : this.x;
        const pointerY = pointer ? pointer.y : this.y;
        const offsetX = Number.isFinite(pointerX) ? pointerX - this.x : 0;
        const offsetY = Number.isFinite(pointerY) ? pointerY - this.y : 0;
        if (Math.hypot(offsetX, offsetY) <= 40) {
            this.dragOffsetX = offsetX;
            this.dragOffsetY = offsetY;
        } else {
            this.dragOffsetX = 0;
            this.dragOffsetY = 0;
        }
        this.setScale(1.85);
        this.setDepth(10);
        this.scene?.resetTouchTilt?.();
        this.clearDragHoldTimer();
        // Automatically drop the food back onto the tray if held for the maximum duration.
        this.dragHoldTimer = this.scene.time.delayedCall(FOOD_MAX_DRAG_MS, () => {
            this.dragHoldTimer = null;
            this.finishDrag();
        });
        return true;
    }

    moveDrag(dragX: number, dragY: number) {
        if (!this.isBeingDragged || !this.scene?.tray) {
            return;
        }
        const bounds = this.scene.tray.getBounds();
        const clamped = clampFoodPosition(dragX, dragY, bounds, 25);
        this.setPosition(clamped.x, clamped.y);
        if (this.body) {
            this.body.reset(clamped.x, clamped.y);
        }
    }

    finishDrag(pointer?: Phaser.Input.Pointer) {
        this.clearDragHoldTimer();
        this.resetInputDragState(pointer);
        if (!this.isBeingDragged) {
            return;
        }
        this.isBeingDragged = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.setScale(1.5);
        this.setDepth(0);

        let targetX = this.x;
        let targetY = this.y;
        if (this.scene?.tray && this.scene?.foods) {
            const bounds = this.scene.tray.getBounds();
            const existingFoods = (this.scene.foods.getChildren() as Food[])
                .filter((other) => other !== this && other.active && Boolean(other.body?.enable) && !other.isBeingEaten)
                .map((other) => ({ x: other.x, y: other.y }));
            const resolved = resolveFoodDropPosition(
                { x: this.x, y: this.y },
                existingFoods,
                bounds,
                { x: this.dragOriginX, y: this.dragOriginY },
                32
            );
            targetX = resolved.x;
            targetY = resolved.y;
        }

        this.dragOriginX = targetX;
        this.dragOriginY = targetY;

        this.setPosition(targetX, targetY);
        if (this.body) {
            this.body.reset(targetX, targetY);
        }

        this.startDragCooldown();
    }

    private resetInputDragState(pointer?: Phaser.Input.Pointer) {
        if (this.input) {
            this.input.dragState = 0;
        }
        const sceneInput = this.scene?.input;
        if (!sceneInput) {
            return;
        }
        const targetPointer = pointer ?? sceneInput.activePointer;
        if (targetPointer && typeof sceneInput.setDragState === 'function') {
            sceneInput.setDragState(targetPointer, 0);
        }
    }

    private startDragCooldown() {
        this.clearDragCooldownTimer();
        if (!this.scene?.time || this.scene.gameOver || !this.body?.enable || this.isBeingEaten) {
            this.isDragCooldown = false;
            return;
        }
        this.isDragCooldown = true;
        this.setAlpha(0.7);
        this.dragCooldownTimer = this.scene.time.delayedCall(FOOD_DRAG_COOLDOWN_MS, () => {
            this.dragCooldownTimer = null;
            this.isDragCooldown = false;
            if (this.active && !this.isBeingEaten) {
                this.setAlpha(1);
            }
        });
    }

    private clearDragHoldTimer() {
        if (this.dragHoldTimer) {
            this.dragHoldTimer.remove(false);
            this.dragHoldTimer = null;
        }
    }

    private clearDragCooldownTimer() {
        if (this.dragCooldownTimer) {
            this.dragCooldownTimer.remove(false);
            this.dragCooldownTimer = null;
        }
    }

    private clearDragTimers() {
        this.clearDragHoldTimer();
        this.clearDragCooldownTimer();
    }

    private emitCrumbs() {
        if (!this.scene?.add || this.scene.gameOver) {
            return;
        }
        const crumbPalette = [0xffd166, 0xffa07a, 0xf4a261, 0xe76f51, 0xffbe0b];
        for (let i = 0; i < 5; i++) {
            const color = Phaser.Math.RND.pick(crumbPalette);
            const crumb = this.scene.add.circle(
                this.x + Phaser.Math.Between(-6, 6),
                this.y + Phaser.Math.Between(-6, 6),
                Phaser.Math.Between(2, 3),
                color
            );
            crumb.setDepth(1);
            const destX = crumb.x + Phaser.Math.Between(-18, 18);
            const destY = crumb.y + Phaser.Math.Between(-18, 18);
            this.scene.tweens.add({
                targets: crumb,
                x: destX,
                y: destY,
                alpha: 0,
                scale: 0.2,
                duration: 550,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    crumb.destroy();
                }
            });
        }
    }
}
