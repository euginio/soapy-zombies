import { Scene, Physics } from "phaser";


/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies: Zombie
 * @license      
 */
export class Zombie extends Physics.Arcade.Sprite {
    private ZOMBIE_SPEED: number = 100;
    private eatSpeed: number;
    private direction: number;

    private sprites: any;

    body: Physics.Arcade.Body;
    
    // https://phaser.io/examples/v3/view/physics/arcade/extending-arcade-sprite#
    constructor(scene:Scene) {
        super(scene, 0, 0, 'zombie_sheet');    

        this.play('camina');

        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        // this.setBounce(1,1);
        // this.setCollideWorldBounds(true);
        // this.body.onWorldBounds = true;


        // this.setVelocity(Phaser.Math.Between(-200, 200), -200);
        // this.body.allowGravity = false;>
    }

    public static newRandomZombie(scene: Scene) {
        var aDirection = Math.abs(Math.random() * 4 * 90);
        var newZombie: Zombie;
        /*        if (aDirection == 0 || aDirection == 4) {
                    newZombie = new NorthZombie(game);
                }*/
        newZombie = new NorthZombie(scene);
        return newZombie;
    }

    getZombieSpeed() {
        return this.ZOMBIE_SPEED;
    }

    slowDown() {
        // this.body.velocity.y = -this.getZombieSpeed();
    }

    eatBrain() {

    }

    zombieOut() {
        // this.game.state.score += 20;
        // this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
export class NorthZombie extends Zombie {

    constructor(scene:Scene) {
        super(scene);
        this.x = <number>scene.game.config.width/2
        this.y=50
    }
    
    setBaseVelocity() {
        // this.body.velocity.y = this.getZombieSpeed();
    }

    updateVelocity(o:any) {
        // updating player velocity
        
        // this.body.velocity.y += o.y*10;	
        //for use landscape use o.beta instead of o.gamma
    }

}
