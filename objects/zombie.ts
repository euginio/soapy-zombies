import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies: Zombie
 * @license      
 */
export class Zombie extends Physics.Arcade.Sprite {
    private ZOMBIE_SPEED: number = 75;
    private eatSpeed: number;
    private direction: number;

    private sprites: any;

    body: Physics.Arcade.Body;

    scene: GameScene;
    
    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene:GameScene) {
        super(scene, Phaser.Math.Between(0, <number>scene.game.config.width),
            Phaser.Math.Between(0, <number>scene.game.config.height), 'zombie_sheet');    

        this.play('camina');

        // scene.add.existing(this);
        scene.physics.add.existing(this);
        // this.scene.physics.moveToObject(this,this.scene.brain, Phaser.Math.Between(12,60))

        // this.setAngle

        //  this.body.allowGravity = true;



    }

    public static newRandomZombie(scene: GameScene) {
        // var aDirection = Math.abs(Math.random() * 4 * 90);
        var newZombie: Zombie;
        newZombie = new Zombie(scene);
        return newZombie;
    }

    update(){
        // this.setAcceleration(
        //     (-(this.x-this.scene.brain.x)/10)+this.scene.gravity.x,
        //     (-(this.y-this.scene.brain.y)/10)+this.scene.gravity.y
        //     // (-(this.x-this.scene.brain.x)/10),
        //     // (-(this.y-this.scene.brain.y)/10)
        // );
        // this.setVelocity(this.ZOMBIE_SPEED)

        // let xDistance = Math.abs(this.x-this.scene.brain.x)
        // let yDistance = Math.abs(this.y-this.scene.brain.y)

        let xDistance = this.x-this.scene.brain.x
        let yDistance = this.y-this.scene.brain.y
        let total = Math.abs(xDistance)+Math.abs(yDistance)
        
        let zombieSpeedX 
        if (this.x > this.scene.brain.x){
            zombieSpeedX = this.ZOMBIE_SPEED+this.ZOMBIE_SPEED*-this.scene.gravity.x
        }else{
            zombieSpeedX = this.ZOMBIE_SPEED+this.ZOMBIE_SPEED*this.scene.gravity.x

        }
        let zombieSpeedY 
        if (this.y > this.scene.brain.y){
            zombieSpeedY = this.ZOMBIE_SPEED+this.ZOMBIE_SPEED*-this.scene.gravity.y
        }else{
            zombieSpeedY = this.ZOMBIE_SPEED+this.ZOMBIE_SPEED*this.scene.gravity.y
        }

        this.setVelocityX((zombieSpeedX*-xDistance)/total)
        this.setVelocityY((zombieSpeedY*-yDistance)/total)
        
    }

    eatBrain() {

    }

    zombieOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
