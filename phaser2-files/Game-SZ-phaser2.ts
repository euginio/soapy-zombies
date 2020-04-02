

// -------------------------------------------------------------------------
class State extends Phaser.State {
    private brain: Phaser.Sprite;
    private soapBubbles: Phaser.Group;
    private zombies: Phaser.Group;
    private cursors: Phaser.CursorKeys;

    public score: number = 0;
    public scoreString: string = '';
    public scoreText: Phaser.Text;

    private newZombieTime: number = 0;
    private timeEating: number = -1;

    preload() {
        this.game.stage.backgroundColor = '#85b5e1';
        // this.game.load.spritesheet('zombie', 'resources/img/zombie_sheet.png', 46, 49)
        // this.game.load.spritesheet('brain', 'resources/img/brain.png', 81, 61);
        // this.game.load.spritesheet('soapBubble', 'resources/img/ball.png', 25, 25);
    }
    // render(){
    //     this.game.debug.text(`Debugging Phaser ${JSON.stringify(orient)}`, 20, 20, 'yellow', 'Segoe UI');
    // }
    create() {


        this.brain = this.game.add.sprite(this.game.width / 2, this.game.height / 2, 'brain');
        this.game.physics.arcade.enable(this.brain);
        this.brain.animations.add('aeten', null, 4, false);
        this.brain.body.immovable = true;

        this.soapBubbles = this.game.add.group();
        this.soapBubbles.enableBody = true;

        this.zombies = this.game.add.group();
        this.zombies.enableBody = true;
        this.zombies.setAll('outOfBoundsKill', true);
        this.zombies.setAll('checkWorldBounds', true);

        //  The score
        this.scoreString = 'Score : ';
        this.scoreText = this.game.add.text(10, 10, this.scoreString + this.score, { font: '34px Arial', fill: '#fff' });

        this.cursors = this.game.input.keyboard.createCursorKeys();

        this.game.input.onDown.add(this.goFullScreen, this);
         
        this.setupGyro();
    }

    goFullScreen() {
        // Stretch to fill
        this.game.scale.fullScreenScaleMode = Phaser.ScaleManager.EXACT_FIT;

        // Keep original size
        // game.scale.fullScreenScaleMode = Phaser.ScaleManager.NO_SCALE;

        // Maintain aspect ratio
        // game.scale.fullScreenScaleMode = Phaser.ScaleManager.SHOW_ALL;

        this.game.scale.startFullScreen(false);
    }

    setupGyro() {	
        gyro.frequency = 500;	
        // start gyroscope detection	
        var zom = this.zombies;	
        var scoretxt = this.scoreText;	
        gyro.startTracking(function (o) {	
            zom.callAll('updateVelocity', null, o);	
            scoretxt.text = o.x + " " + o.y;	
        });	
    }

    update() {
        let gameTime = this.game.time.now;
        let self = this;
        if (gameTime > this.newZombieTime && this.zombies.length < 1) {
            var newZombie: Zombie = Zombie.newRandomZombie(this.game);
            this.zombies.add(newZombie);
            this.newZombieTime = gameTime + 1200;
            this.zombies.callAll('setBaseVelocity', null);
        }
        this.game.physics.arcade.collide(this.zombies, this.brain, function (brain, zombie) {
            zombie.animations.stop('walk');
            zombie.animations.play('eatBrain', 7);
            brain.play('aeten', 3, false, true);

            //change this logic for one where brain has live points
            if (self.timeEating == -1) { self.timeEating = gameTime };
            if (gameTime > self.timeEating + 3000) {
                location.reload();
            }
        });

        if (this.game.input.activePointer.isDown) {
            this.soapFloor();
        }

        if (this.cursors.up.isDown) {
            // this.zombies.setAll('body.velocity.x', -(this.ZOMBIE_SPEED - 35));
            this.zombies.callAll('slowDown', null);
            // this.zombies.setAll('body.velocity.x',-(ZOMBIE_SPEED-35));
        }

        // if (this.cursors.left.isDown) {
        //     this.zombies.setAll('body.velocity.x', -(this.ZOMBIE_SPEED - 35));
        //     // this.zombies.setAll('body.velocity.x',-(ZOMBIE_SPEED-35));
        // }

        // if (this.cursors.right.isDown) {
        //     // this.zombies.setAll('body.velocity.x', ZOMBIE_SPEED);
        //     this.zombies.setAll('body.velocity.x', this.ZOMBIE_SPEED - 35);
        // }
    }

    soapFloor() {
        var newSoap = this.soapBubbles.create(this.game.input.x, this.game.input.y, 'soapBubble');
        newSoap.width = newSoap.height = 25;
    }

}

// -------------------------------------------------------------------------
window.onload = () => {
    new Game();
};