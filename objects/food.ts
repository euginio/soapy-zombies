import { Scene, Physics } from "phaser";
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

    constructor(scene: GameScene) {
        super(scene, 0, 0, 'food');
        
        this.body.immovable = true;
        this.setScale(1.5);
        // this.setSize(this.width/3, this.height/3)
        // this.setOffset(17)
        this.setCircle(10,7,8)

        // this.setFrame(Phaser.Math.Between(0,24))
        this.setFrame(Phaser.Math.RND.pick([0,1,9,10,11,13,15,17,20,23,24]))

        // this.on('animationcomplete', this.destroy, this);
    }

    init() {
        this.placeInTray()
    }
    
    placeInTray(){
        let tray = this.scene.tray
        let trayB=tray.getBounds()
        let margin= 40
        this.setRandomPosition(trayB.left+margin, trayB.top+margin*2, trayB.right-trayB.left-margin*2, trayB.bottom-margin*4);
    }

    destroy(animation?) {
        if (this.body.enable) {
            this.scene.destroyFood(this)
            // this.scene.time.delayedCall(1500, () => {
            this.disableBody(false, true);
            // })
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
        if (this.body.enable && !this.anims.isPlaying) {
            // this.play('eatingFood');

            this.scene.tweens.add({targets:this, 
                scale: { value: 0, duration: 1500, ease: 'Power1' },
                yoyo:false, loop:0,
                onComplete:()=>this.destroy()})
        }
    }

    foodOut() {
    
    }
}
