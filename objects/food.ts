import {
    areFoodsOverlapping,
    canFoodBeDragged,
    canFoodBeEaten,
    calculateAntStealVelocity,
    calculateCarrierAntOffset,
    calculateCooperativeStealSpeed,
    calculateRandomTrayPosition,
    CATERPILLAR_GRAVITY_FACTOR,
    CATERPILLAR_SPEED,
    detectFoodShake,
    DragSample,
    clampFoodPosition,
    findNearestTrayEdgePoint,
    isFoodInsideTray,
    isWormTouchingFood,
    hasCarriedFoodExitedTray,
    insetHorizontalTrayBounds,
    MAX_CARRIER_ANTS,
    rectanglesOverlap,
    FOOD_DRAG_COOLDOWN_MS,
    FOOD_EAT_DURATION_MS,
    FOOD_MAX_DRAG_MS,
    FoodBiteStep,
    getFoodBiteSequence,
    resolveFoodDropPosition
} from "../game-rules";
import { GameScene } from "../scenes/game-scene";
import { Caterpillar } from "./caterpillar";
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
    carrierAnts: any[] = [];
    get carrierCount(): number { return this.carrierAnts.length; }
    get isBeingCarried(): boolean { return this.carrierAnts.length > 0; }
    get carrierAnt(): any | null { return this.carrierAnts[0] ?? null; }
    dragOffsetX: number = 0;
    dragOffsetY: number = 0;
    dragOriginX: number = 0;
    dragOriginY: number = 0;
    eatProgress: number = 0;
    isWormEating: boolean = false;
    eatingBug: any | null = null;
    eatTween: Phaser.Tweens.Tween | null = null;
    private biteSequence: FoodBiteStep[] = [];
    private appliedBiteIndex: number = 0;
    private canvasTex: Phaser.Textures.CanvasTexture | null = null;
    private eatCanvasKey: string | null = null;
    private dragHoldTimer: Phaser.Time.TimerEvent | null = null;
    private dragSamples: DragSample[] = [];
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
        this.releaseAllCarriers(false);
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragOriginX = this.x;
        this.dragOriginY = this.y;
        this.cleanupEatCanvas();
        this.setTexture("food");
        this.setFrame(Phaser.Math.Between(0, 24));
        this.setAlpha(1);
        this.setAngle(0);
        this.setDepth(0);
        this.isBeingEaten = false;
        this.isWormEating = false;
        this.eatingBug = null;
        this.eatTween = null;
        this.eatProgress = 0;
        this.biteSequence = [];
        this.appliedBiteIndex = 0;
        this.setScale(1.5);
        this.placeInTray()
    }
    
    addCarrier(ant: any): boolean {
        if (!this.carrierAnts.includes(ant) && this.carrierAnts.length < MAX_CARRIER_ANTS) {
            this.carrierAnts.push(ant);
            this.setDepth(2);
            return true;
        }
        return false;
    }

    removeCarrier(ant: any) {
        this.carrierAnts = this.carrierAnts.filter((a) => a !== ant);
        if (this.carrierAnts.length === 0 && !this.isBeingDragged) {
            this.setDepth(0);
        }
    }

    releaseAllCarriers(returnToTray = true) {
        const ants = [...this.carrierAnts];
        this.carrierAnts = [];
        this.setDepth(0);
        ants.forEach((ant) => ant.dropFood(returnToTray));
    }

    dropFoodOnTray() {
        this.releaseAllCarriers(false);
        if (this.scene?.tray) {
            const bounds = this.scene.tray.getBounds();
            const clamped = clampFoodPosition(this.x, this.y, bounds, 25);
            this.setPosition(clamped.x, clamped.y);
            if (this.body) {
                this.body.reset(clamped.x, clamped.y);
            }
        }
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
        const spawnWidth = trayB.width - margin * 2;
        const spawnHeight = trayB.height - margin * 4;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.setRandomPosition(trayB.left + margin, trayB.top + margin * 2, spawnWidth, spawnHeight);
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
        this.cleanupEatCanvas();
        this.releaseAllCarriers(false);
        this.isBeingEaten = false;
        this.isWormEating = false;
        this.eatingBug = null;
        this.eatTween = null;

        // Count food only when an active piece is eaten/stolen during gameplay, not during scene cleanup.
        if (!fromScene && this.body && this.body.enable) {
            this.scene.destroyFood(this);
            this.disableBody(true, true);
        }

        if (this.scene?.foods) {
            this.scene.foods.remove(this, false, false);
        }
        super.destroy(fromScene);
    }
    stealFoodAndDestroy() {
        if (!this.active || !this.body) {
            return;
        }
        const carriers = [...this.carrierAnts];
        this.carrierAnts = [];
        carriers.forEach((ant) => {
            ant.carriedFood = null;
        });

        if (this.body.enable) {
            this.scene.destroyFood(this);
            this.disableBody(true, true);
        }
        this.destroy();

        carriers.forEach((ant) => {
            ant.stealSuccess();
        });
    }

    shakeOffCarriers() {
        if (!this.isBeingCarried || this.carrierAnts.length === 0) {
            return;
        }
        const ants = [...this.carrierAnts];
        const shakenCount = ants.length;
        this.carrierAnts = [];
        this.setDepth(10);
        this.dragSamples = [];

        if (this.scene?.tray) {
            const trayBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
            ants.forEach((ant) => {
                const target = calculateRandomTrayPosition(trayBounds);
                ant.fallFromFood(target.x, target.y);
            });
        } else {
            ants.forEach((ant) => ant.dropFood(false));
        }

        if (typeof (this.scene as any)?.onAntsShaken === "function") {
            (this.scene as any).onAntsShaken(shakenCount);
        }
    }

    updateCarrierPositions() {
        if (!this.scene?.tray || this.carrierAnts.length === 0) {
            return;
        }
        const trayBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
        const edgePoint = findNearestTrayEdgePoint(this.x, this.y, trayBounds);
        const escapeAngle = Phaser.Math.Angle.Between(this.x, this.y, edgePoint.x, edgePoint.y);

        this.carrierAnts.forEach((ant, idx) => {
            const offset = calculateCarrierAntOffset(idx, this.carrierAnts.length, escapeAngle, 18);
            ant.setPosition(this.x + offset.x, this.y + offset.y);
            ant.setAngle(Phaser.Math.RadToDeg(escapeAngle) + 90);
            if (ant.body) {
                ant.body.reset(ant.x, ant.y);
            }
        });
    }

    update(_time?: number, delta: number = 16) {
        if (this.isBeingCarried && this.carrierAnts.length > 0 && this.scene?.tray) {
            if (this.isBeingEaten) {
                this.releaseAllCarriers(false);
                return;
            }
            if (this.isBeingDragged) {
                this.updateCarrierPositions();
                return;
            }
            const trayBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
            const speed = calculateCooperativeStealSpeed(55, this.carrierAnts.length);
            const velocity = calculateAntStealVelocity(
                this.x,
                this.y,
                trayBounds,
                speed
            );
            const dt = delta / 1000;
            this.x += velocity.x * dt;
            this.y += velocity.y * dt;
            if (this.body) {
                this.body.reset(this.x, this.y);
            }

            this.updateCarrierPositions();

            const trayOverlapBounds = insetHorizontalTrayBounds(this.scene.tray.getBounds());
            const carrierBounds = this.carrierAnts.map((ant) => ant.getBounds());
            if (
                hasCarriedFoodExitedTray(this.getBounds(), trayOverlapBounds, carrierBounds) ||
                !isFoodInsideTray(this.x, this.y, trayOverlapBounds)
            ) {
                this.stealFoodAndDestroy();
                return;
            }
        }

        if (this.isWormEating && this.eatTween && !this.eatTween.isDestroyed()) {
            const wormTouching = this.checkWormTouching();
            if (this.isBeingEaten && !wormTouching) {
                this.eatTween.pause();
                this.isBeingEaten = false;
                this.setAngle(0);
                this.setScale(1.5);
                this.eatingBug = null;
            } else if (!this.isBeingEaten && wormTouching && !this.isBeingDragged && !this.isBeingCarried) {
                this.isBeingEaten = true;
                this.eatTween.resume();
            }
        }
    }

    checkWormTouching(): boolean {
        if (this.isBeingDragged || this.isBeingCarried || !this.body?.enable || !this.active) {
            return false;
        }
        const worm = this.eatingBug as Caterpillar | null;
        if (worm && worm.active && worm.isAlive && !worm.isClimbing && Boolean(worm.body?.enable)) {
            if (
                rectanglesOverlap(this.getBounds(), worm.getBounds()) ||
                isWormTouchingFood({ x: worm.x, y: worm.y }, { x: this.x, y: this.y }, 46)
            ) {
                return true;
            }
        }
        const caterpillars = this.scene?.caterpillars?.getChildren() as Caterpillar[] | undefined;
        if (caterpillars) {
            const myBounds = this.getBounds();
            for (const c of caterpillars) {
                if (c.active && c.isAlive && !c.isClimbing && Boolean(c.body?.enable)) {
                    if (
                        rectanglesOverlap(myBounds, c.getBounds()) ||
                        isWormTouchingFood({ x: c.x, y: c.y }, { x: this.x, y: this.y }, 46)
                    ) {
                        this.eatingBug = c;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    beingEat(ant?: { x: number; y: number }) {
        if (!canFoodBeEaten(this.isBeingEaten, this.isBeingDragged, this.body?.enable ?? false, this.isBeingCarried)) {
            return;
        }
        this.clearDragTimers();
        this.resetInputDragState();
        this.isDragCooldown = false;
        this.setAlpha(1);
        this.isBeingEaten = true;
        this.eatingBug = ant ?? null;

        const isCaterpillar = Boolean(
            ant && (
                ant instanceof Caterpillar ||
                (ant as any).gravityFactor === CATERPILLAR_GRAVITY_FACTOR ||
                (ant as any).CATERPILLAR_SPEED === CATERPILLAR_SPEED ||
                (this.scene?.caterpillars && (this.scene.caterpillars.getChildren() as any[]).includes(ant))
            )
        );
        if (isCaterpillar) {
            this.isWormEating = true;
        }

        if (this.eatTween && !this.eatTween.isDestroyed()) {
            if (this.eatTween.isPaused()) {
                this.eatTween.resume();
            }
            return;
        }

        let incomingAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        if (ant && typeof ant.x === 'number' && typeof ant.y === 'number') {
            incomingAngle = Math.atan2(ant.y - this.y, ant.x - this.x);
        }

        this.biteSequence = getFoodBiteSequence(incomingAngle);
        this.appliedBiteIndex = 0;

        this.cleanupEatCanvas();
        this.eatCanvasKey = `eaten_food_${Date.now()}_${Phaser.Math.Between(1000, 9999)}`;
        this.canvasTex = null;
        try {
            if (this.scene?.textures) {
                this.canvasTex = this.scene.textures.createCanvas(this.eatCanvasKey, 32, 32);
            }
        } catch {
            this.canvasTex = null;
        }

        if (this.canvasTex) {
            this.canvasTex.drawFrame('food', this.frame.name, 0, 0);
            this.setTexture(this.eatCanvasKey);
        }

        const applyBiteStep = (step: FoodBiteStep) => {
            if (this.canvasTex) {
                const ctx = this.canvasTex.context;
                let sampledColor: number | null = null;
                try {
                    const sampleX = Math.floor(Phaser.Math.Clamp(step.x, 0, 31));
                    const sampleY = Math.floor(Phaser.Math.Clamp(step.y, 0, 31));
                    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                    if (pixel[3] > 60) {
                        sampledColor = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
                    }
                } catch {
                    // Fall back if pixel reading fails
                }

                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(step.x, step.y, step.radius, 0, Math.PI * 2);
                const subAngle = step.progress * 13;
                ctx.arc(
                    step.x + Math.cos(subAngle) * (step.radius * 0.4),
                    step.y + Math.sin(subAngle) * (step.radius * 0.4),
                    step.radius * 0.7,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
                ctx.restore();
                this.canvasTex.update();

                const worldBiteX = this.x + (step.x - 16) * this.scaleX;
                const worldBiteY = this.y + (step.y - 16) * this.scaleY;
                this.emitCrumbs(worldBiteX, worldBiteY, sampledColor);
            } else {
                this.emitCrumbs(this.x, this.y);
            }
        };

        if (this.biteSequence.length > 0 && this.biteSequence[0].progress <= 0.06) {
            applyBiteStep(this.biteSequence[0]);
            this.appliedBiteIndex = 1;
        }

        this.eatProgress = 0;
        this.eatTween = this.scene.tweens.add({
            targets: this,
            eatProgress: 1,
            duration: FOOD_EAT_DURATION_MS,
            ease: 'Linear',
            onUpdate: (tween: Phaser.Tweens.Tween) => {
                if (!this.active || !this.isBeingEaten) {
                    return;
                }
                const progress = tween.progress;
                while (this.appliedBiteIndex < this.biteSequence.length && progress >= this.biteSequence[this.appliedBiteIndex].progress) {
                    applyBiteStep(this.biteSequence[this.appliedBiteIndex]);
                    this.appliedBiteIndex++;
                }
                const chompWiggle = Math.sin(progress * Math.PI * 18) * 5;
                this.setAngle(chompWiggle);
                const chompPulse = Math.sin((progress * 6) % 1 * Math.PI) * 0.08;
                this.setScale(1.5 + chompPulse);
                if (progress > 0.92) {
                    this.setAlpha((1 - progress) / 0.08);
                }
            },
            onComplete: () => {
                this.cleanupEatCanvas();
                this.destroy();
            }
        });
    }

    private cleanupEatCanvas() {
        this.canvasTex = null;
        if (this.eatCanvasKey) {
            const key = this.eatCanvasKey;
            this.eatCanvasKey = null;
            if (this.scene?.textures?.exists(key)) {
                this.scene.textures.remove(key);
            }
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
                Boolean(this.scene?.gameOver),
                Boolean((this.scene as any)?.isDragEnabled ?? true),
                Boolean((this.scene as any)?.isLevelTransitioning)
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
        const now = pointer?.downTime ?? this.scene?.time?.now ?? Date.now();
        this.dragSamples = [{ x: this.x, y: this.y, time: now }];
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
        if (this.isBeingCarried) {
            this.carrierAnts.forEach((ant) => ant.setDepth(11));
            this.updateCarrierPositions();
        }
        this.scene?.resetTouchTilt?.();
        this.clearDragHoldTimer();
        // Automatically drop the food back onto the tray if held for the maximum duration.
        this.dragHoldTimer = this.scene.time.delayedCall(FOOD_MAX_DRAG_MS, () => {
            this.dragHoldTimer = null;
            this.finishDrag();
        });
        return true;
    }

    moveDrag(dragX: number, dragY: number, timeMs?: number) {
        if (!this.isBeingDragged || !this.scene?.tray) {
            return;
        }
        const bounds = this.scene.tray.getBounds();
        const clamped = clampFoodPosition(dragX, dragY, bounds, 25);
        this.setPosition(clamped.x, clamped.y);
        if (this.body) {
            this.body.reset(clamped.x, clamped.y);
        }

        const now = timeMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const lastSample = this.dragSamples[this.dragSamples.length - 1];
        if (!lastSample || Math.hypot(dragX - lastSample.x, dragY - lastSample.y) >= 1.5 || (now - lastSample.time) >= 16) {
            this.dragSamples.push({ x: dragX, y: dragY, time: now });
        }
        const cutoff = now - 800;
        while (this.dragSamples.length > 0 && this.dragSamples[0].time < cutoff) {
            this.dragSamples.shift();
        }

        if (this.isBeingCarried) {
            if (detectFoodShake(this.dragSamples)) {
                this.shakeOffCarriers();
                return;
            }
            this.updateCarrierPositions();
        }
    }

    finishDrag(pointer?: Phaser.Input.Pointer) {
        this.clearDragHoldTimer();
        this.resetInputDragState(pointer);
        this.dragSamples = [];
        if (!this.isBeingDragged) {
            return;
        }
        this.isBeingDragged = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.setScale(1.5);
        if (this.isBeingCarried) {
            this.setDepth(2);
            this.carrierAnts.forEach((ant) => ant.setDepth(0));
        } else {
            this.setDepth(0);
        }

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
        if (this.isBeingCarried) {
            this.updateCarrierPositions();
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

    private emitCrumbs(originX = this.x, originY = this.y, preferredColor?: number | null) {
        if (!this.scene?.add || this.scene.gameOver) {
            return;
        }
        const defaultPalette = [0xffd166, 0xffa07a, 0xf4a261, 0xe76f51, 0xffbe0b];
        const count = Phaser.Math.Between(4, 7);
        for (let i = 0; i < count; i++) {
            const color = preferredColor && Math.random() < 0.75 ? preferredColor : Phaser.Math.RND.pick(defaultPalette);
            const crumb = this.scene.add.circle(
                originX + Phaser.Math.Between(-4, 4),
                originY + Phaser.Math.Between(-4, 4),
                Phaser.Math.Between(2, 3),
                color
            );
            crumb.setDepth(2);
            const burstAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const burstDist = Phaser.Math.Between(8, 22);
            const destX = crumb.x + Math.cos(burstAngle) * burstDist;
            const destY = crumb.y + Math.sin(burstAngle) * burstDist;
            this.scene.tweens.add({
                targets: crumb,
                x: destX,
                y: destY,
                alpha: 0,
                scale: 0.1,
                duration: Phaser.Math.Between(450, 650),
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    crumb.destroy();
                }
            });
        }
    }
}
