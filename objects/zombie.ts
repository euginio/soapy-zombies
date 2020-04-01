/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @copyright    2020 eugenio arosteguy
 * @description  Soapy zombies: Zombie
 * @license      
 */
export abstract class Zombie extends Phaser.GameObjects.Sprite {
    private ZOMBIE_SPEED: number = 100;
    private eatSpeed: number;
    private direction: number;

    private sprites: any;

    constructor(params) {
        super(params.scene, params.x, params.y, params.key, params.frame);    
        // this.scene.add.existing(this);
        var fsi = frameStartIndex;
        this.animations.add('eatBrain', [0,12,1,13]);
        this.animations.add('walk', [0, 6, 12, 1, 7, 13]);
        this.play('walk', 5, true);

        this.events.onOutOfBounds.add(this.zombieOut, this);
    }

    // public constructor(game: Phaser.Game, x: number, y: number, frameStartIndex: number, axis: string, axisModificator: string) {
    //     super(game, x, y, 'zombie');

    //     var fsi = frameStartIndex;
    //     this.animations.add('eatBrain', [0,12,1,13]);
    //     this.animations.add('walk', [0, 6, 12, 1, 7, 13]);
    //     this.play('walk', 5, true);

    //     this.events.onOutOfBounds.add(this.zombieOut, this);
    // }

    public static newRandomZombie(game: Phaser.Game) {
        var aDirection = Math.abs(Math.random() * 4 * 90);
        var newZombie: Zombie;
        /*        if (aDirection == 0 || aDirection == 4) {
                    newZombie = new NorthZombie(game);
                }*/
        newZombie = new NorthZombie(game);
        return newZombie;
    }

    getZombieSpeed() {
        return this.ZOMBIE_SPEED;
    }

    slowDown() {
        this.body.velocity.y = -this.getZombieSpeed();
    }

    eatBrain() {

    }

    zombieOut() {
        this.game.state.score += 20;
        this.game.state.scoreText.text = this.game.state.scoreString + this.game.state.score;
    }
}
export class NorthZombie extends Zombie {

    public constructor(game: Phaser.Game) {
        super(game, game.width / 2, 0, 1, 'y', '-');
    }

    setBaseVelocity() {
        this.body.velocity.y = this.getZombieSpeed();
    }

    updateVelocity(o:any) {
        // updating player velocity
        
        this.body.velocity.y += o.y*10;	
        //for use landscape use o.beta instead of o.gamma
    }

}
