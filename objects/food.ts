import { canFoodBeEaten, clampFoodPosition } from "../game-rules";
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
        this.isBeingDragged = false;
        this.setDepth(0);
        this.isBeingEaten = false;
        this.setScale(1.5);
        this.placeInTray()
    }
    
    placeInTray(){
        // Keep food away from the tray's edges so ants have room to approach it.
        let tray = this.scene.tray
        let trayB=tray.getBounds()
        let margin= 40
        this.setRandomPosition(trayB.left+margin, trayB.top+margin*2, trayB.right-trayB.left-margin*2, trayB.bottom-margin*4);
    }

    destroy(fromScene?: boolean) {
        this.isBeingDragged = false;
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

        this.on('dragstart', () => {
            if (this.isBeingEaten || !this.body || !this.body.enable || this.scene.gameOver) {
                return;
            }
            this.isBeingDragged = true;
            this.setScale(1.85);
            this.setDepth(10);
        });

        this.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            if (!this.isBeingDragged || !this.scene.tray) {
                return;
            }
            const bounds = this.scene.tray.getBounds();
            const clamped = clampFoodPosition(dragX, dragY, bounds, 25);
            this.setPosition(clamped.x, clamped.y);
            if (this.body) {
                this.body.reset(clamped.x, clamped.y);
            }
        });

        this.on('dragend', () => {
            if (!this.isBeingDragged) {
                return;
            }
            this.isBeingDragged = false;
            this.setScale(1.5);
            this.setDepth(0);
            if (this.body) {
                this.body.reset(this.x, this.y);
            }
        });
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
