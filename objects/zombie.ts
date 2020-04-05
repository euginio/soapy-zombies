import { Scene, Physics } from "phaser";
import { GameScene } from "../scenes/game-scene";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies: Zombie
 * @license      
 */
export class Zombie extends Physics.Arcade.Sprite {
    private ZOMBIE_SPEED: number = 45;
    private eatSpeed: number;
    private direction: number;

    private sprites: any;

    body: Physics.Arcade.Body;

    scene: GameScene;

    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene: GameScene) {
        super(scene, 0, 0, 'zombie_sheet');


        // scene.add.existing(this);
        scene.physics.add.existing(this);
        // this.scene.physics.moveToObject(this,this.scene.brain, Phaser.Math.Between(12,60))

        // this.setAngle

        //  this.body.allowGravity = true;
        // this.setCollideWorldBounds()

        this.initZombie();
    }
    initZombie() {
        this.play('camina');
        // this.setRandomPosition();
        let x, y = 0;
        let randomX = Phaser.Math.Between(0, <number>this.scene.game.config.width)
        let randomY = Phaser.Math.Between(0, <number>this.scene.game.config.height)
        switch (Phaser.Math.Between(0, 3)) {
            case 0: //top border
                x = randomX
                break;
            case 1: // right border
                x = <number>this.scene.game.config.width
                y = randomY
                break;
            case 2: // bottom border
                x = randomX
                y = <number>this.scene.game.config.height
                break;
            case 3: // left border
                y = randomY
                break;
        }
        this.setPosition(x, y);
    }

    // setRandomPosition(){
    //     this.x = Phaser.Math.Between(0, <number>this.scene.game.config.width)
    //     this.y = Phaser.Math.Between(0, <number>this.scene.game.config.height)
    // }

    public static newRandomZombie(scene: GameScene) {
        // var aDirection = Math.abs(Math.random() * 4 * 90);
        var newZombie: Zombie;
        newZombie = new Zombie(scene);
        return newZombie;
    }

    update() {
        // this.setAcceleration(
        //     (-(this.x-this.scene.brain.x)/10)+this.scene.gravity.x,
        //     (-(this.y-this.scene.brain.y)/10)+this.scene.gravity.y
        //     // (-(this.x-this.scene.brain.x)/10),
        //     // (-(this.y-this.scene.brain.y)/10)
        // );
        // this.setVelocity(this.ZOMBIE_SPEED)

        // let xDistance = Math.abs(this.x-this.scene.brain.x)
        // let yDistance = Math.abs(this.y-this.scene.brain.y)

        //TODO: if problems here try with setting angle and using 
        // physics gravity (now we are simulating gravity)
        let xDistance = this.x - this.scene.brain.x
        let yDistance = this.y - this.scene.brain.y
        let total = Math.abs(xDistance) + Math.abs(yDistance)

        let zombieSpeedY = (this.ZOMBIE_SPEED * -yDistance) / total + this.scene.gravity.y * 25
        let zombieSpeedX = (this.ZOMBIE_SPEED * -xDistance) / total + this.scene.gravity.x * 25

        this.setVelocityX(zombieSpeedX)
        this.setVelocityY(zombieSpeedY)

        if (!Phaser.Geom.Rectangle.Overlaps(this.scene.physics.world.bounds, this.getBounds())) {
            this.scene.zombieOut(this)
        }

    }

    eatBrain() {

    }

    zombieOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
