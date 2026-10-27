import assert = require("node:assert/strict");
import { describe, it } from "node:test";
import {
  areFoodsOverlapping,
  calculateAntSearchHeading,
  calculateAntSearchVelocity,
  calculateAntVelocity,
  isNearTrayEdge,
  shouldAntSearchForFood,
  calculateAntStealVelocity,
  shouldTiltAffectAnt,
  shouldTiltAffectCaterpillar,
  calculateWaveExtraAnts,
  getLevelConfig,
  isFinalWaveTriggered,
  isLevelGoalMet,
  formatLevelObjective,
  calculateCarrierAntOffset,
  calculateCooperativeStealSpeed,
  calculateRandomTrayPosition,
  detectFoodShake,
  DragSample,
  canAntStealFood,
  findNearestTrayEdgePoint,
  hasCarriedFoodExitedTray,
  isFoodInsideTray,
  calculateWormInchingScale,
  CATERPILLAR_FALL_SCORE,
  CATERPILLAR_GRAVITY_FACTOR,
  CATERPILLAR_SPEED,
  resolveCaterpillarEscape,
  calculateDeviceMotionTilt,
  calculateDeviceTilt,
  canFoodBeDragged,
  canFoodBeEaten,
  clampFoodPosition,
  FOOD_DRAG_COOLDOWN_MS,
  FOOD_MAX_DRAG_MS,
  getScreenOrientationAngle,
  calculateVisualLayerLayout,
  debugColorToTint,
  insetHorizontalTrayBounds,
  MAX_CARRIER_ANTS,
  isNewHighScore,
  isTabletDevice,
  parseStoredHighScore,
  parseStoredMuted,
  pickNearestTarget,
  rectanglesOverlap,
  resolveAntEscape,
  resolveFoodDropPosition,
  resolveFoodLoss,
  FOOD_EAT_DURATION_MS,
  getFoodBiteSequence,
  getActiveFoodBites,
  shouldKeepScreenAwake,
  isScreenWakeLockSupported,
  isWormTouchingFood,
  shouldWormContinueEating,
  canPauseGame,
  checkNeutralTiltProgress,
  isTiltNeutral,
  togglePauseState,
  formatPauseMenuSummary,
  formatLevelCompleteSummary,
  canShowLevelComplete,
  canStartLevelGameplay,
  formatLevelIntroModal
} from "../game-rules";
import { ScreenWakeLock, WakeLockSentinelLike } from "../services/wake-lock";

describe("caterpillar rules", () => {
  it("checks whether a worm is touching food and whether eating can continue", () => {
    const food = { x: 200, y: 150 };
    // Close contact (distance 30 <= 46)
    assert.equal(isWormTouchingFood({ x: 220, y: 150 }, food, 46), true);
    // Boundary contact (distance 45 <= 46)
    assert.equal(isWormTouchingFood({ x: 200, y: 195 }, food, 46), true);
    // Separated by tray tilt or drag (distance 60 > 46)
    assert.equal(isWormTouchingFood({ x: 260, y: 150 }, food, 46), false);

    // Active touching worm can continue eating
    assert.equal(
      shouldWormContinueEating({
        isTouching: true,
        isAlive: true,
        isClimbing: false,
        isFoodDragged: false,
        isFoodCarried: false
      }),
      true
    );

    // When worm stops touching food (e.g. tilted away), eating must not continue
    assert.equal(
      shouldWormContinueEating({
        isTouching: false,
        isAlive: true,
        isClimbing: false,
        isFoodDragged: false,
        isFoodCarried: false
      }),
      false
    );

    // When worm dies or falls off tray, eating must not continue
    assert.equal(
      shouldWormContinueEating({
        isTouching: true,
        isAlive: false,
        isClimbing: false,
        isFoodDragged: false,
        isFoodCarried: false
      }),
      false
    );

    // When food is dragged away by the player, eating must not continue
    assert.equal(
      shouldWormContinueEating({
        isTouching: true,
        isAlive: true,
        isClimbing: false,
        isFoodDragged: true,
        isFoodCarried: false
      }),
      false
    );

    // When food is carried away by ants, eating must not continue
    assert.equal(
      shouldWormContinueEating({
        isTouching: true,
        isAlive: true,
        isClimbing: false,
        isFoodDragged: false,
        isFoodCarried: true
      }),
      false
    );
  });

  it("defines caterpillar movement speed and heavy gravity resistance", () => {
    assert.equal(CATERPILLAR_SPEED, 24);
    assert.equal(CATERPILLAR_GRAVITY_FACTOR, 3.5);
    assert.equal(CATERPILLAR_FALL_SCORE, 2);
  });

  it("calculates inching crawling wave scale values", () => {
    const at0 = calculateWormInchingScale(0, 600);
    assert.equal(at0.scaleX, 1);
    assert.equal(at0.scaleY, 1);

    // Quarter cycle: maximum stretch (higher scaleY, lower scaleX)
    const at150 = calculateWormInchingScale(150, 600);
    assert.ok(at150.scaleY > 1);
    assert.ok(at150.scaleX < 1);

    // Three-quarter cycle: maximum contraction (lower scaleY, higher scaleX)
    const at450 = calculateWormInchingScale(450, 600);
    assert.ok(at450.scaleY < 1);
    assert.ok(at450.scaleX > 1);
  });

  it("awards 2 points when a caterpillar escapes the tray", () => {
    const result1 = resolveCaterpillarEscape(0);
    assert.equal(result1.score, 2);
    assert.equal(result1.pointsAwarded, 2);

    const result2 = resolveCaterpillarEscape(5);
    assert.equal(result2.score, 7);
    assert.equal(result2.pointsAwarded, 2);
  });
});

describe("ant food stealing rules", () => {
  const tray = { x: 50, y: 30, width: 400, height: 240 };

  it("determines whether an ant can steal or join stealing a food piece", () => {
    // 0 carriers -> can steal
    assert.equal(canAntStealFood(true, false, false, 0, false, false, true), true);
    // 1 to 3 carriers -> additional ants can join in
    assert.equal(canAntStealFood(true, false, false, 1, false, false, true), true);
    assert.equal(canAntStealFood(true, false, false, 3, false, false, true), true);
    // 4 carriers (max reached) -> no more ants can join this food
    assert.equal(canAntStealFood(true, false, false, 4, false, false, true), false);
    // Ant already carrying food -> cannot steal another
    assert.equal(canAntStealFood(true, false, true, 0, false, false, true), false);
    // Food being dragged by player -> cannot steal
    assert.equal(canAntStealFood(true, false, false, 0, true, false, true), false);
    // Food being eaten by caterpillar -> cannot steal
    assert.equal(canAntStealFood(true, false, false, 0, false, true, true), false);
    // Ant climbing onto tray -> cannot steal
    assert.equal(canAntStealFood(true, true, false, 0, false, false, true), false);
  });

  it("scales steal speed faster as more ants carry the same food", () => {
    const baseSpeed = 55;
    const speed0 = calculateCooperativeStealSpeed(baseSpeed, 0);
    const speed1 = calculateCooperativeStealSpeed(baseSpeed, 1);
    const speed2 = calculateCooperativeStealSpeed(baseSpeed, 2);
    const speed3 = calculateCooperativeStealSpeed(baseSpeed, 3);
    const speed4 = calculateCooperativeStealSpeed(baseSpeed, 4);
    const speed5 = calculateCooperativeStealSpeed(baseSpeed, 5);

    assert.equal(speed0, 0);
    // Speed must strictly increase with each additional ant
    assert.ok(speed1 < speed2);
    assert.ok(speed2 < speed3);
    assert.ok(speed3 < speed4);
    // Caps at MAX_CARRIER_ANTS
    assert.equal(speed5, speed4);
    assert.equal(speed1, baseSpeed * 0.7);
    assert.equal(speed2, baseSpeed * 1.0);
    assert.equal(speed4, baseSpeed * 1.6);
  });

  it("calculates distinct ant offsets around the carried food", () => {
    const offset1 = calculateCarrierAntOffset(0, 1, 0, 20);
    assert.ok(Math.hypot(offset1.x, offset1.y) >= 19);

    const offset2A = calculateCarrierAntOffset(0, 2, 0, 20);
    const offset2B = calculateCarrierAntOffset(1, 2, 0, 20);
    // Offsets for ant 0 and ant 1 must be distinct (opposite sides)
    assert.notDeepEqual(offset2A, offset2B);
    assert.ok(offset2A.y > 0 && offset2B.y < 0);
  });

  it("finds the nearest tray edge exit point for stealing food", () => {
    // Close to left edge
    const nearLeft = findNearestTrayEdgePoint(70, 150, tray);
    assert.ok(nearLeft.x < 50);
    assert.equal(nearLeft.y, 150);

    // Close to right edge
    const nearRight = findNearestTrayEdgePoint(430, 150, tray);
    assert.ok(nearRight.x > 450);
    assert.equal(nearRight.y, 150);

    // Close to top edge
    const nearTop = findNearestTrayEdgePoint(250, 45, tray);
    assert.ok(nearTop.y < 30);
    assert.equal(nearTop.x, 250);

    // Close to bottom edge
    const nearBottom = findNearestTrayEdgePoint(250, 255, tray);
    assert.ok(nearBottom.y > 270);
    assert.equal(nearBottom.x, 250);
  });

  it("calculates steal velocity directing the ant towards the closest edge", () => {
    // Ant near left edge moves leftward (negative vx)
    const velLeft = calculateAntStealVelocity(70, 150, tray, 50, 0, 0, 10);
    assert.ok(velLeft.x < 0);

    // Ant near right edge moves rightward (positive vx)
    const velRight = calculateAntStealVelocity(430, 150, tray, 50, 0, 0, 10);
    assert.ok(velRight.x > 0);
  });

  it("does not allow tray tilt or gravity to affect ants carrying food or in levels with tilt disabled", () => {
    assert.equal(shouldTiltAffectAnt(false), true);
    assert.equal(shouldTiltAffectAnt(true), false);
    assert.equal(shouldTiltAffectAnt(false, true), true);
    assert.equal(shouldTiltAffectAnt(true, true), false);
    assert.equal(shouldTiltAffectAnt(false, false), false);
    assert.equal(shouldTiltAffectAnt(true, false), false);
    assert.equal(shouldTiltAffectAnt(false, true, true), false);
    assert.equal(shouldTiltAffectAnt(false, true, false), true);
    assert.equal(shouldTiltAffectCaterpillar(true), true);
    assert.equal(shouldTiltAffectCaterpillar(false), false);

    // Steal velocity must be unaffected by board tilt / gravity parameters
    const velWithoutTilt = calculateAntStealVelocity(70, 150, tray, 50, 0, 0, 0);
    const velWithTilt = calculateAntStealVelocity(70, 150, tray, 50, 30, -30, 10);
    assert.equal(velWithTilt.x, velWithoutTilt.x);
    assert.equal(velWithTilt.y, velWithoutTilt.y);
  });

  it("checks whether food coordinates remain inside tray bounds", () => {
    assert.equal(isFoodInsideTray(200, 150, tray), true);
    assert.equal(isFoodInsideTray(40, 150, tray), false);
    assert.equal(isFoodInsideTray(460, 150, tray), false);
  });

  it("disallows food from being eaten while being carried by an ant", () => {
    assert.equal(canFoodBeEaten(false, false, true, true), false);
    assert.equal(canFoodBeEaten(false, false, true, false), true);
  });

  it("detects when food or carrier ants have exited the tray bounds", () => {
    const trayBounds = { x: 50, y: 30, width: 400, height: 240 };
    const foodInside = { x: 200, y: 150, width: 30, height: 30 };
    const antInside1 = { x: 190, y: 150, width: 20, height: 20 };
    const antInside2 = { x: 210, y: 150, width: 20, height: 20 };

    assert.equal(
      hasCarriedFoodExitedTray(foodInside, trayBounds, [antInside1, antInside2]),
      false
    );

    // One carrier ant steps off the tray
    const antOutside = { x: 20, y: 150, width: 20, height: 20 };
    assert.equal(
      hasCarriedFoodExitedTray(foodInside, trayBounds, [antInside1, antOutside]),
      true
    );

    // Food itself moves off the tray
    const foodOutside = { x: 10, y: 150, width: 30, height: 30 };
    assert.equal(
      hasCarriedFoodExitedTray(foodOutside, trayBounds, [antInside1, antInside2]),
      true
    );
  });
});

describe("visual rendering helpers", () => {
  it("converts debug hex colors to Phaser fill tint values", () => {
    assert.equal(debugColorToTint("#ff4136"), 0xff4136);
    assert.equal(debugColorToTint("#0074d9"), 0x0074d9);
  });

  it("uses untransformed layout metrics to position the HUD", () => {
    assert.deepEqual(
      calculateVisualLayerLayout({ left: 18, top: 24, width: 290, height: 150 }, 580, 300),
      { left: 18, top: 24, width: 290, height: 150, scaleX: 0.5, scaleY: 0.5 }
    );
  });
});

describe("tablet detection", () => {
  it("recognizes Android tablets from user agent client hints", () => {
    assert.equal(isTabletDevice(false, "Android", "Mozilla/5.0", 5, 800, 1280), true);
  });

  it("does not classify phones or non-touch devices as tablets", () => {
    assert.equal(isTabletDevice(true, "Android", "Mozilla/5.0", 5, 800, 1280), false);
    assert.equal(isTabletDevice(false, "Android", "Mozilla/5.0", 0, 800, 1280), false);
  });

  it("recognizes iPads and falls back to tablet-sized touch screens", () => {
    assert.equal(isTabletDevice(undefined, "iPad", "Mozilla/5.0", 5, 390, 844), true);
    assert.equal(isTabletDevice(undefined, "MacIntel", "Mozilla/5.0", 5, 390, 844), true);
    assert.equal(isTabletDevice(undefined, "Linux", "Mozilla/5.0", 5, 600, 960), true);
    assert.equal(isTabletDevice(undefined, "Linux", "Mozilla/5.0", 5, 390, 844), false);
  });

  it("recognizes Silk, PlayBook, and Tablet user agents even on a small screen", () => {
    assert.equal(isTabletDevice(undefined, "Linux", "Silk/3.13 Safari/535.19", 5, 390, 844), true);
    assert.equal(isTabletDevice(undefined, "Linux", "PlayBook Tablet OS", 5, 390, 844), true);
    assert.equal(isTabletDevice(undefined, "Linux", "Tablet; rv:1.0", 5, 390, 844), true);
  });

  it("rejects devices without touch even when the user agent looks like a tablet", () => {
    assert.equal(isTabletDevice(undefined, "iPad", "Mozilla/5.0", 0, 800, 1280), false);
  });
});

describe("mobile device tilt", () => {
  it("resolves orientation angle from ScreenOrientation API or iOS window.orientation", () => {
    assert.equal(getScreenOrientationAngle(90, 0), 90);
    assert.equal(getScreenOrientationAngle(undefined, 90), 90);
    assert.equal(getScreenOrientationAngle(null, -90), -90);
    assert.equal(getScreenOrientationAngle(undefined, "90"), 90);
    assert.equal(getScreenOrientationAngle(undefined, undefined), 0);
    assert.equal(getScreenOrientationAngle(Number.NaN, 90), 90);
  });

  it("maps portrait orientation changes to horizontal and vertical tilt", () => {
    assert.deepEqual(calculateDeviceTilt(15, -15, 0, 0, 0), {
      x: -0.5,
      y: 0.5
    });
  });

  it("maps sensor axes to screen axes in landscape orientation", () => {
    const clockwise = calculateDeviceTilt(30, 0, 0, 0, 90);
    assert.ok(Math.abs(clockwise.x - 1) < 1e-10);
    assert.ok(Math.abs(clockwise.y) < 1e-10);

    const counterClockwise = calculateDeviceTilt(30, 0, 0, 0, -90);
    assert.ok(Math.abs(counterClockwise.x + 1) < 1e-10);
    assert.ok(Math.abs(counterClockwise.y) < 1e-10);
  });

  it("clamps extreme device angles to the supported tilt range", () => {
    assert.deepEqual(calculateDeviceTilt(90, -90, 0, 0, 0), {
      x: -1,
      y: 1
    });
  });

  it("measures tilt relative to the re-centered baseline", () => {
    assert.deepEqual(calculateDeviceTilt(45, 10, 15, 10, 0), {
      x: 0,
      y: 1
    });
    assert.deepEqual(calculateDeviceTilt(15, -15, 15, -15, 0), {
      x: 0,
      y: 0
    });
  });

  it("inverts the vertical axis when the screen is rotated 180 degrees", () => {
    const tilt = calculateDeviceTilt(30, 0, 0, 0, 180);
    assert.ok(Math.abs(tilt.x) < 1e-10);
    assert.ok(Math.abs(tilt.y + 1) < 1e-10);
  });

  it("maps fallback accelerometer readings into screen axes across orientations", () => {
    assert.deepEqual(calculateDeviceMotionTilt(-2.5, 2.5, 0), {
      x: 0.5,
      y: 0.5
    });

    const landscapePrimary = calculateDeviceMotionTilt(2.5, 5, 90);
    assert.ok(Math.abs(landscapePrimary.x - 1) < 1e-10);
    assert.ok(Math.abs(landscapePrimary.y - 0.5) < 1e-10);

    const landscapeSecondary = calculateDeviceMotionTilt(2.5, 5, -90);
    assert.ok(Math.abs(landscapeSecondary.x + 1) < 1e-10);
    assert.ok(Math.abs(landscapeSecondary.y + 0.5) < 1e-10);

    assert.deepEqual(calculateDeviceMotionTilt(-20, 20, 0), {
      x: 1,
      y: 1
    });
  });
});

describe("ant steering", () => {
  it("moves toward food with the configured speed", () => {
    assert.deepEqual(calculateAntVelocity(10, -5, 60, 0, 0, 10), {
      x: -40,
      y: 20
    });
  });

  it("combines movement toward food with tray gravity", () => {
    assert.deepEqual(calculateAntVelocity(10, 0, 50, 2, -1, 10), {
      x: -30,
      y: -10
    });
  });

  it("does not produce invalid velocity when already at the target", () => {
    assert.deepEqual(calculateAntVelocity(0, 0, 50, 2, -1, 10), {
      x: 20,
      y: -10
    });
  });
});

describe("ant food search rules", () => {
  it("determines whether an ant should search for food when no target is reachable", () => {
    // When food target exists, ant pursues it, so search is false
    assert.equal(shouldAntSearchForFood(true, 1, true), false);
    assert.equal(shouldAntSearchForFood(true, 1, false), false);

    // When no food target exists and food is actively being dragged, ant searches for food
    assert.equal(shouldAntSearchForFood(false, 1, true), true);
    assert.equal(shouldAntSearchForFood(false, 2, true), true);

    // When no food exists in the level (e.g. Level 3), ant does not search
    assert.equal(shouldAntSearchForFood(false, 0, false), false);
    assert.equal(shouldAntSearchForFood(false, 0, true), false);

    // When food exists but is not being dragged, ant does not search (normal idle/waiting)
    assert.equal(shouldAntSearchForFood(false, 1, false), false);
  });

  it("detects when ant is near tray edges within the avoidance margin", () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 };
    // Inside interior
    assert.equal(isNearTrayEdge(300, 250, bounds, 35), false);

    // Near left edge (100 to 135)
    assert.equal(isNearTrayEdge(110, 250, bounds, 35), true);
    // Near right edge (465 to 500)
    assert.equal(isNearTrayEdge(480, 250, bounds, 35), true);
    // Near top edge (100 to 135)
    assert.equal(isNearTrayEdge(300, 120, bounds, 35), true);
    // Near bottom edge (365 to 400)
    assert.equal(isNearTrayEdge(300, 390, bounds, 35), true);
  });

  it("steers search heading back toward tray center when approaching boundary", () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 };
    // Center is at (300, 250)

    // Near left edge (x=110, y=250), moving left (heading = Math.PI)
    // Moving left near left edge should steer back toward center (dx > 0, heading = 0)
    const steerFromLeft = calculateAntSearchHeading(110, 250, Math.PI, bounds, { margin: 35 });
    assert.equal(Math.cos(steerFromLeft) > 0, true);

    // Near right edge (x=490, y=250), moving right (heading = 0)
    // Moving right near right edge should steer back toward center (dx < 0)
    const steerFromRight = calculateAntSearchHeading(490, 250, 0, bounds, { margin: 35 });
    assert.equal(Math.cos(steerFromRight) < 0, true);

    // Near top edge (x=300, y=110), moving up (heading = -Math.PI / 2)
    // Moving up near top edge should steer down toward center (dy > 0)
    const steerFromTop = calculateAntSearchHeading(300, 110, -Math.PI / 2, bounds, { margin: 35 });
    assert.equal(Math.sin(steerFromTop) > 0, true);

    // Near bottom edge (x=300, y=390), moving down (heading = Math.PI / 2)
    // Moving down near bottom edge should steer up toward center (dy < 0)
    const steerFromBottom = calculateAntSearchHeading(300, 390, Math.PI / 2, bounds, { margin: 35 });
    assert.equal(Math.sin(steerFromBottom) < 0, true);
  });

  it("updates heading when retarget interval fires or preserves it while wandering safely inside tray", () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 };
    // Inside tray interior
    const currentHeading = 1.25;

    // Timer not expired -> keeps heading
    const preserved = calculateAntSearchHeading(300, 250, currentHeading, bounds, {
      margin: 35,
      shouldPickNewAngle: false
    });
    assert.equal(preserved, currentHeading);

    // Timer expired with new random angle -> adopts new angle
    const newAngle = 2.8;
    const adopted = calculateAntSearchHeading(300, 250, currentHeading, bounds, {
      margin: 35,
      shouldPickNewAngle: true,
      randomAngle: newAngle
    });
    assert.equal(adopted, newAngle);
  });

  it("calculates search velocity combining wandering speed with tray gravity", () => {
    // Pure walking heading east (0 rad) with zero gravity
    const vEast = calculateAntSearchVelocity(0, 50, 0, 0, 10);
    assert.equal(Math.round(vEast.x), 50);
    assert.equal(Math.round(vEast.y), 0);

    // Pure walking heading south (pi/2 rad) with zero gravity
    const vSouth = calculateAntSearchVelocity(Math.PI / 2, 50, 0, 0, 10);
    assert.equal(Math.round(vSouth.x), 0);
    assert.equal(Math.round(vSouth.y), 50);

    // Combined with tray tilt gravity (gravityX = 2, gravityFactor = 10 -> +20)
    const vTilted = calculateAntSearchVelocity(0, 50, 2, -1, 10);
    assert.equal(Math.round(vTilted.x), 70); // 50 + 20
    assert.equal(Math.round(vTilted.y), -10); // 0 - 10
  });
});

describe("ant escape scoring", () => {
  it("awards one point and adds an ant at each seventh escape", () => {
    assert.deepEqual(resolveAntEscape(6, 7), { score: 7, spawnAnt: true });
  });

  it("awards a point without adding an ant between milestones", () => {
    assert.deepEqual(resolveAntEscape(5, 7), { score: 6, spawnAnt: false });
  });

  it("does not spawn an extra ant on the first escape", () => {
    assert.deepEqual(resolveAntEscape(0, 7), { score: 1, spawnAnt: false });
  });

  it("spawns another extra ant at the next milestone", () => {
    assert.deepEqual(resolveAntEscape(13, 7), { score: 14, spawnAnt: true });
  });
});

describe("food loss", () => {
  it("reduces the remaining food without ending the game", () => {
    assert.deepEqual(resolveFoodLoss(2), { foodCount: 1, gameOver: false });
  });

  it("ends the game when the final food is eaten", () => {
    assert.deepEqual(resolveFoodLoss(1), { foodCount: 0, gameOver: true });
  });
});

describe("food drag and interaction", () => {
  it("defines a 3-second max drag duration and a 1-2 second cooldown", () => {
    assert.equal(FOOD_MAX_DRAG_MS, 3000);
    assert.equal(FOOD_DRAG_COOLDOWN_MS >= 1000 && FOOD_DRAG_COOLDOWN_MS <= 2000, true);
  });

  it("determines whether food can be dragged based on cooldown, eaten, and game state", () => {
    assert.equal(canFoodBeDragged(false, false, true, false), true);
    assert.equal(canFoodBeDragged(true, false, true, false), false);
    assert.equal(canFoodBeDragged(false, true, true, false), false);
    assert.equal(canFoodBeDragged(false, false, false, false), false);
    assert.equal(canFoodBeDragged(false, false, true, true), false);
    assert.equal(canFoodBeDragged(false, false, true, false, true, true), false);
    assert.equal(canFoodBeDragged(false, false, true, false, true, false), true);
  });

  it("determines whether food can be eaten based on dragged and eaten states", () => {
    assert.equal(canFoodBeEaten(false, false, true), true);
    assert.equal(canFoodBeEaten(false, true, true), false);
    assert.equal(canFoodBeEaten(true, false, true), false);
    assert.equal(canFoodBeEaten(false, false, false), false);
  });

  it("clamps food position within the tray bounds", () => {
    const tray = { x: 50, y: 30, width: 400, height: 240 };
    assert.deepEqual(clampFoodPosition(100, 100, tray, 20), { x: 100, y: 100 });
    assert.deepEqual(clampFoodPosition(10, 10, tray, 20), { x: 70, y: 50 });
    assert.deepEqual(clampFoodPosition(500, 300, tray, 20), { x: 430, y: 250 });
  });

  it("detects when two food positions overlap within the minimum spacing", () => {
    assert.equal(areFoodsOverlapping({ x: 100, y: 100 }, { x: 110, y: 110 }, 32), true);
    assert.equal(areFoodsOverlapping({ x: 100, y: 100 }, { x: 140, y: 100 }, 32), false);
  });

  it("resolves food drop position by accepting free spots and placing next to existing food on overlap", () => {
    const tray = { x: 50, y: 30, width: 400, height: 240 };
    const existing = [{ x: 100, y: 100 }, { x: 200, y: 150 }];
    const origin = { x: 300, y: 180 };

    // Placing in an open area succeeds
    const freeCandidate = { x: 280, y: 80 };
    assert.deepEqual(resolveFoodDropPosition(freeCandidate, existing, tray, origin, 32), freeCandidate);

    // Placing overlapping another food places next to it without overlapping any existing food
    const overlapDrop = resolveFoodDropPosition({ x: 110, y: 110 }, existing, tray, origin, 32);
    assert.notDeepEqual(overlapDrop, origin);
    assert.equal(areFoodsOverlapping(overlapDrop, existing[0], 32), false);
    assert.equal(areFoodsOverlapping(overlapDrop, existing[1], 32), false);
    assert.deepEqual(clampFoodPosition(overlapDrop.x, overlapDrop.y, tray, 25), overlapDrop);
    const distToTarget = Math.hypot(overlapDrop.x - existing[0].x, overlapDrop.y - existing[0].y);
    assert.ok(distToTarget >= 32 && distToTarget <= 40);

    // Placing directly at the exact position of another food also places next to it
    const exactDrop = resolveFoodDropPosition({ x: 100, y: 100 }, existing, tray, origin, 32);
    assert.notDeepEqual(exactDrop, origin);
    assert.equal(areFoodsOverlapping(exactDrop, existing[0], 32), false);
    assert.equal(areFoodsOverlapping(exactDrop, existing[1], 32), false);
    assert.deepEqual(clampFoodPosition(exactDrop.x, exactDrop.y, tray, 25), exactDrop);

    // Placing with clearance (distance 40 >= 32) succeeds
    assert.deepEqual(resolveFoodDropPosition({ x: 140, y: 100 }, existing, tray, origin, 32), { x: 140, y: 100 });

    // Placing outside tray bounds clamps to tray
    assert.deepEqual(resolveFoodDropPosition({ x: 10, y: 10 }, [], tray, origin, 32, 20), { x: 70, y: 50 });

    // When completely surrounded on all sides and no free spot can be found, falls back to origin
    const denselySurrounded = [{ x: 100, y: 100 }];
    for (let r = 25; r <= 80; r += 20) {
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
        denselySurrounded.push({ x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) });
      }
    }
    assert.deepEqual(resolveFoodDropPosition({ x: 100, y: 100 }, denselySurrounded, tray, origin, 32), origin);
  });

  it("generates bite steps that progressively consume the food from the incoming angle", () => {
    assert.equal(FOOD_EAT_DURATION_MS, 1500);
    const sequence = getFoodBiteSequence(0);
    assert.equal(sequence.length, 6);
    // Progress must strictly increase
    for (let i = 1; i < sequence.length; i++) {
      assert.ok(sequence[i].progress > sequence[i - 1].progress);
    }
    // First bite is near incoming angle (x > 16)
    assert.ok(sequence[0].x > 16);
    // Final bite covers the entire 32x32 sprite
    assert.equal(sequence[5].x, 16);
    assert.equal(sequence[5].y, 16);
    assert.ok(sequence[5].radius >= 16);
  });

  it("filters active bites based on animation progress", () => {
    const sequence = getFoodBiteSequence(Math.PI);
    assert.deepEqual(getActiveFoodBites(0.01, sequence), []);
    assert.equal(getActiveFoodBites(0.1, sequence).length, 1);
    assert.equal(getActiveFoodBites(0.5, sequence).length, 3);
    assert.equal(getActiveFoodBites(0.9, sequence).length, 5);
    assert.equal(getActiveFoodBites(1.0, sequence).length, 6);
  });
});

describe("high score", () => {
  it("saves a score above the current high score", () => {
    assert.equal(isNewHighScore(8, 7), true);
  });

  it("does not replace an equal or higher high score", () => {
    assert.equal(isNewHighScore(7, 7), false);
    assert.equal(isNewHighScore(6, 7), false);
  });

  it("treats the first scored game as a new high score", () => {
    assert.equal(isNewHighScore(1, 0), true);
  });
});

describe("nearest food", () => {
  it("picks the closest enabled target", () => {
    const nearest = pickNearestTarget(0, 0, [
      { id: "far", x: 10, y: 0 },
      { id: "near", x: 3, y: 4 },
      { id: "farther", x: 20, y: 20 }
    ]);
    assert.equal(nearest?.id, "near");
  });

  it("keeps the first target when two foods are equally close", () => {
    const nearest = pickNearestTarget(0, 0, [
      { id: "first", x: 5, y: 0 },
      { id: "second", x: 0, y: 5 }
    ]);
    assert.equal(nearest?.id, "first");
  });

  it("returns null when no targets are available", () => {
    const nearest = pickNearestTarget(0, 0, []);
    assert.equal(nearest, null);
  });
});

describe("tray overlap", () => {
  it("insets the tray horizontally before checking whether an ant has fallen", () => {
    const tray = insetHorizontalTrayBounds({ x: 0, y: 0, width: 200, height: 100 });
    assert.deepEqual(tray, { x: 25, y: 0, width: 150, height: 100 });
    assert.equal(rectanglesOverlap(tray, { x: 40, y: 10, width: 20, height: 20 }), true);
    assert.equal(rectanglesOverlap(tray, { x: 0, y: 10, width: 20, height: 20 }), false);
  });

  it("treats touching edges as outside the tray", () => {
    const tray = { x: 25, y: 0, width: 150, height: 100 };
    assert.equal(rectanglesOverlap(tray, { x: 5, y: 10, width: 20, height: 20 }), false);
    assert.equal(rectanglesOverlap(tray, { x: 40, y: -20, width: 20, height: 20 }), false);
    assert.equal(rectanglesOverlap(tray, { x: 40, y: 100, width: 20, height: 20 }), false);
  });
});

describe("stored high score", () => {
  it("reads a valid stored score", () => {
    assert.equal(parseStoredHighScore("12"), 12);
  });

  it("falls back to zero for missing, corrupted or negative values", () => {
    assert.equal(parseStoredHighScore(null), 0);
    assert.equal(parseStoredHighScore(undefined), 0);
    assert.equal(parseStoredHighScore(""), 0);
    assert.equal(parseStoredHighScore("abc"), 0);
    assert.equal(parseStoredHighScore("-5"), 0);
  });
});

describe("stored mute preference", () => {
  it("is muted only for an explicit saved flag", () => {
    assert.equal(parseStoredMuted("1"), true);
    assert.equal(parseStoredMuted("0"), false);
    assert.equal(parseStoredMuted(null), false);
    assert.equal(parseStoredMuted(undefined), false);
    assert.equal(parseStoredMuted("yes"), false);
  });
});

describe("food shake and ant scatter rules", () => {
  it("calculates random tray positions strictly within the inset tray bounds", () => {
    const bounds = { x: 100, y: 50, width: 400, height: 200 };
    const pos1 = calculateRandomTrayPosition(bounds, 20, 0, 0);
    assert.deepEqual(pos1, { x: 120, y: 70 });

    const pos2 = calculateRandomTrayPosition(bounds, 20, 1, 1);
    assert.deepEqual(pos2, { x: 480, y: 230 });

    const pos3 = calculateRandomTrayPosition(bounds, 20, 0.5, 0.5);
    assert.deepEqual(pos3, { x: 300, y: 150 });
  });

  it("detects food shaking from rapid direction reversals while dragging", () => {
    // Insufficient samples
    assert.equal(detectFoodShake([]), false);
    assert.equal(detectFoodShake([{ x: 100, y: 100, time: 100 }]), false);

    // Smooth linear drag (no reversals)
    const linearDrag: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 130, y: 100, time: 150 },
      { x: 165, y: 100, time: 200 },
      { x: 200, y: 100, time: 250 }
    ];
    assert.equal(detectFoodShake(linearDrag), false);

    // Micro-jitter (< minSegmentDistance)
    const jitter: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 103, y: 100, time: 150 },
      { x: 98, y: 100, time: 200 },
      { x: 102, y: 100, time: 250 }
    ];
    assert.equal(detectFoodShake(jitter), false);

    // Horizontal shake (left -> right -> left)
    const horizontalShake: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 75, y: 100, time: 150 },
      { x: 115, y: 100, time: 200 },
      { x: 80, y: 100, time: 250 }
    ];
    assert.equal(detectFoodShake(horizontalShake), true);

    // Vertical shake (up -> down -> up)
    const verticalShake: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 100, y: 70, time: 140 },
      { x: 100, y: 110, time: 180 },
      { x: 100, y: 75, time: 220 }
    ];
    assert.equal(detectFoodShake(verticalShake), true);

    // Expired samples outside windowMs
    const expiredShake: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 70, y: 100, time: 150 },
      { x: 110, y: 100, time: 200 },
      { x: 80, y: 100, time: 1000 }
    ];
    assert.equal(detectFoodShake(expiredShake), false);

    // Tight back-and-forth wiggle (small amplitude 16px swing)
    const wiggleShake: DragSample[] = [
      { x: 100, y: 100, time: 100 },
      { x: 108, y: 100, time: 140 },
      { x: 92, y: 100, time: 180 },
      { x: 108, y: 100, time: 220 },
      { x: 92, y: 100, time: 260 }
    ];
    assert.equal(detectFoodShake(wiggleShake), true);
  });

  it("determines whether the screen should remain awake", () => {
    assert.equal(shouldKeepScreenAwake(true, true), true);
    assert.equal(shouldKeepScreenAwake(false, true), false);
    assert.equal(shouldKeepScreenAwake(true, false), false);
    assert.equal(shouldKeepScreenAwake(false, false), false);
  });

  it("checks whether navigator supports wake lock", () => {
    assert.equal(isScreenWakeLockSupported(undefined), false);
    assert.equal(isScreenWakeLockSupported({} as any), false);
    assert.equal(isScreenWakeLockSupported({ wakeLock: {} } as any), true);
  });

  it("manages wake lock acquisition, release, and visibility recovery", async () => {
    let requestCount = 0;
    let releasedCount = 0;
    const releaseListeners = new Set<() => void>();

    class MockSentinel implements WakeLockSentinelLike {
      released = false;
      type = "screen";
      async release() {
        this.released = true;
        releasedCount++;
        for (const listener of releaseListeners) {
          listener();
        }
      }
      addEventListener(type: string, listener: () => void) {
        if (type === "release") releaseListeners.add(listener);
      }
      removeEventListener(type: string, listener: () => void) {
        if (type === "release") releaseListeners.delete(listener);
      }
    }

    let currentSentinel: MockSentinel | null = null;
    const mockNav = {
      wakeLock: {
        async request() {
          requestCount++;
          currentSentinel = new MockSentinel();
          return currentSentinel;
        }
      }
    };

    let docVisibility: DocumentVisibilityState = "visible";
    const docListeners = new Map<string, Set<() => void>>();
    const mockDoc = {
      get visibilityState() {
        return docVisibility;
      },
      addEventListener(type: string, listener: () => void) {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        docListeners.get(type)?.delete(listener);
      }
    };

    const winListeners = new Map<string, Set<() => void>>();
    const mockWin = {
      addEventListener(type: string, listener: () => void) {
        if (!winListeners.has(type)) winListeners.set(type, new Set());
        winListeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        winListeners.get(type)?.delete(listener);
      }
    };

    const wakeLock = new ScreenWakeLock(
      () => mockNav as any,
      () => mockDoc as any,
      () => mockWin as any
    );

    const acquired = await wakeLock.acquire();
    assert.equal(acquired, true);
    assert.equal(wakeLock.isLocked, true);
    assert.equal(requestCount, 1);

    await wakeLock.requestLock();
    assert.equal(requestCount, 1);

    docVisibility = "hidden";
    await currentSentinel?.release();
    assert.equal(wakeLock.isLocked, false);

    for (const listener of docListeners.get("visibilitychange") || []) {
      listener();
    }
    assert.equal(requestCount, 1);

    docVisibility = "visible";
    for (const listener of docListeners.get("visibilitychange") || []) {
      listener();
    }
    await Promise.resolve();
    assert.equal(wakeLock.isLocked, true);
    assert.equal(requestCount, 2);

    wakeLock.release();
    assert.equal(wakeLock.isLocked, false);
    assert.equal(wakeLock.active, false);
  });
});
describe("level progression rules", () => {
  it("provides distinct progression configurations for tutorial and advanced levels", () => {
    const lvl1 = getLevelConfig(1);
    assert.equal(lvl1.tiltEnabled, false);
    assert.equal(lvl1.dragEnabled, true);
    assert.equal(lvl1.caterpillarsEnabled, false);
    assert.equal(lvl1.goalType, "move_food");
    assert.equal(lvl1.initialFood, 1);
    assert.equal(lvl1.initialAnts, 0);
    assert.equal(lvl1.goalTarget, 1);

    const lvl2 = getLevelConfig(2);
    assert.equal(lvl2.tiltEnabled, false);
    assert.equal(lvl2.dragEnabled, true);
    assert.equal(lvl2.caterpillarsEnabled, false);
    assert.equal(lvl2.initialFood, 1);
    assert.equal(lvl2.initialAnts, 1);
    assert.equal(lvl2.antSpeed, 0);
    assert.equal(lvl2.goalType, "shake_ants");
    assert.equal(lvl2.goalTarget, 1);
    assert.equal(lvl2.foodCarriedByAnt, true);

    const lvl3 = getLevelConfig(3);
    assert.equal(lvl3.tiltEnabled, true);
    assert.equal(lvl3.dragEnabled, false);
    assert.equal(lvl3.caterpillarsEnabled, false);
    assert.equal(lvl3.initialFood, 0);
    assert.equal(lvl3.initialAnts, 1);
    assert.equal(lvl3.goalType, "defeat_ants");
    assert.equal(lvl3.goalTarget, 1);
    assert.equal(lvl3.antInCenter, true);

    const lvl4 = getLevelConfig(4);
    assert.equal(lvl4.tiltEnabled, true);
    assert.equal(lvl4.dragEnabled, true);
    assert.equal(lvl4.caterpillarsEnabled, false);
    assert.equal(lvl4.goalType, "defeat_ants");
    assert.equal(lvl4.goalTarget, 20);

    const lvl5 = getLevelConfig(5);
    assert.equal(lvl5.tiltEnabled, true);
    assert.equal(lvl5.dragEnabled, true);
    assert.equal(lvl5.caterpillarsEnabled, true);
    assert.equal(lvl5.goalType, "defeat_ants");
    assert.equal(lvl5.goalTarget, 25);
    assert.equal(lvl5.initialCaterpillars, 1);
    assert.equal(lvl5.antSpeed, 62);

    const lvl8 = getLevelConfig(8);
    assert.equal(lvl8.initialCaterpillars, 2);
    assert.equal(lvl8.goalTarget, 40);
    assert.equal(lvl8.antSpeed, 74);

    const lvl10 = getLevelConfig(10);
    assert.equal(lvl10.initialAnts, 8);
    assert.equal(lvl10.initialCaterpillars, 2);
    assert.equal(lvl10.goalTarget, 50);
    assert.equal(lvl10.antSpeed, 82);

    // Level 11 escalates dynamically
    const lvl11 = getLevelConfig(11);
    assert.ok(lvl11.antSpeed > lvl10.antSpeed);
    assert.equal(lvl11.level, 11);
    assert.equal(lvl11.goalTarget, 60);
  });

  it("evaluates whether level completion goals are met", () => {
    assert.equal(isLevelGoalMet("move_food", 0, 1), false);
    assert.equal(isLevelGoalMet("move_food", 1, 1), true);
    assert.equal(isLevelGoalMet("shake_ants", 9, 10), false);
    assert.equal(isLevelGoalMet("shake_ants", 10, 10), true);
    assert.equal(isLevelGoalMet("shake_ants", 11, 10), true);

    assert.equal(isLevelGoalMet("survive_time", 44.9, 45), false);
    assert.equal(isLevelGoalMet("survive_time", 45.0, 45), true);

    assert.equal(isLevelGoalMet("defeat_ants", 14, 15), false);
    assert.equal(isLevelGoalMet("defeat_ants", 15, 15), true);

    assert.equal(isLevelGoalMet("endless", 999, 0), false);
  });

  it("verifies neutral tilt detection and progression", () => {
    assert.equal(isTiltNeutral(0, 0), true);
    assert.equal(isTiltNeutral(0.08, 0.08), true);
    assert.equal(isTiltNeutral(0.2, 0), false);
    assert.equal(isTiltNeutral(0, -0.3), false);

    const step1 = checkNeutralTiltProgress(true, 0, 100, 300);
    assert.equal(step1.isReady, false);
    assert.equal(step1.durationMs, 100);

    const step2 = checkNeutralTiltProgress(true, 200, 100, 300);
    assert.equal(step2.isReady, true);
    assert.equal(step2.durationMs, 300);

    const step3 = checkNeutralTiltProgress(false, 250, 50, 300);
    assert.equal(step3.isReady, false);
    assert.equal(step3.durationMs, 0);
  });

  it("formats level objective HUD strings accurately", () => {
    const lvl1 = getLevelConfig(1);
    assert.equal(formatLevelObjective(lvl1, 0), "MUEVE LA COMIDA: 0/1");
    assert.equal(formatLevelObjective(lvl1, 1), "MUEVE LA COMIDA: 1/1");

    const lvl2 = getLevelConfig(2);
    assert.equal(formatLevelObjective(lvl2, 0), "SACUDE LA COMIDA: 0/1");
    assert.equal(formatLevelObjective(lvl2, 1), "SACUDE LA COMIDA: 1/1");

    const lvl3 = getLevelConfig(3);
    assert.equal(lvl3.waitForNeutralTilt, true);
    assert.equal(formatLevelObjective(lvl3, 0, true), "NIVELA LA BANDEJA");
    assert.equal(formatLevelObjective(lvl3, 0, false), "HORMIGAS: 0/1");
    assert.equal(formatLevelObjective(lvl3, 1), "HORMIGAS: 1/1");

    const lvl5 = getLevelConfig(5);
    assert.equal(formatLevelObjective(lvl5, 4), "HORMIGAS: 4/25");
  });

  it("determines whether the final ant wave is triggered near the end of the level", () => {
    // Threshold is 70% of goalTarget
    assert.equal(isFinalWaveTriggered(6, 10), false);
    assert.equal(isFinalWaveTriggered(7, 10), true);

    assert.equal(isFinalWaveTriggered(31, 45), false);
    assert.equal(isFinalWaveTriggered(32, 45), true);

    assert.equal(isFinalWaveTriggered(10, 15), false);
    assert.equal(isFinalWaveTriggered(11, 15), true);

    assert.equal(isFinalWaveTriggered(17, 25), false);
    assert.equal(isFinalWaveTriggered(18, 25), true);

    assert.equal(isFinalWaveTriggered(0, 0), false);
  });

  it("calculates extra ant count for the final wave based on level tier", () => {
    assert.equal(calculateWaveExtraAnts(1), 2);
    assert.equal(calculateWaveExtraAnts(4), 2);
    assert.equal(calculateWaveExtraAnts(5), 3);
    assert.equal(calculateWaveExtraAnts(10), 3);
  });

  it("respects dragEnabled parameter in canFoodBeDragged", () => {
    // When dragEnabled is false (e.g. Level 3), food cannot be dragged
    assert.equal(canFoodBeDragged(false, false, true, false, false), false);
    // When dragEnabled is true, standard rules apply
    assert.equal(canFoodBeDragged(false, false, true, false, true), true);
  });
});

describe("pause rules", () => {
  it("allows pausing when the game is actively playing", () => {
    assert.equal(canPauseGame(false), true);
  });

  it("does not allow pausing when game over has occurred", () => {
    assert.equal(canPauseGame(true), false);
  });

  it("toggles pause state when game is active", () => {
    assert.equal(togglePauseState(false, false), true);
    assert.equal(togglePauseState(true, false), false);
  });

  it("forces unpaused (false) when game is over", () => {
    assert.equal(togglePauseState(false, true), false);
    assert.equal(togglePauseState(true, true), false);
  });

  it("does not allow pausing when level complete overlay is active", () => {
    assert.equal(canPauseGame(false, true), false);
    assert.equal(togglePauseState(false, false, true), false);
  });

  it("formats pause menu summary with level info, scores, and mute state", () => {
    const summary = formatPauseMenuSummary(2, 18, 50, false);
    assert.equal(summary.levelNumber, 2);
    assert.equal(summary.levelTitle, "Nivel 2");
    assert.equal(summary.levelSubtitle, "¡Sacude la comida!");
    assert.equal(summary.score, 18);
    assert.equal(summary.highScore, 50);
    assert.equal(summary.isMuted, false);

    const mutedSummary = formatPauseMenuSummary(3, 0, 10, true);
    assert.equal(mutedSummary.isMuted, true);
    assert.equal(mutedSummary.levelTitle, "Nivel 3");
  });
});

describe("level complete screen rules", () => {
  it("formats level completion summary with next level title and instructions", () => {
    const summary1 = formatLevelCompleteSummary(1);
    assert.equal(summary1.completedLevel, 1);
    assert.equal(summary1.nextLevel, 2);
    assert.equal(summary1.nextTitle, "Nivel 2");
    assert.equal(summary1.nextSubtitle, "¡Sacude la comida!");
    assert.equal(summary1.nextInstruction, "Sacúdela con fuerza.");

    const summary2 = formatLevelCompleteSummary(2);
    assert.equal(summary2.completedLevel, 2);
    assert.equal(summary2.nextLevel, 3);
    assert.equal(summary2.nextTitle, "Nivel 3");
  });

  it("determines whether the level complete screen can be shown", () => {
    assert.equal(canShowLevelComplete(false, false), true);
    assert.equal(canShowLevelComplete(true, false), false);
    assert.equal(canShowLevelComplete(false, true), false);
    assert.equal(canShowLevelComplete(true, true), false);
  });
});
describe("level intro confirmation modal rules", () => {
  it("formats level intro modal data with title, subtitle, instructions, and confirmation button label", () => {
    const lvl1 = getLevelConfig(1);
    const modal1 = formatLevelIntroModal(lvl1);
    assert.equal(modal1.title, "Nivel 1");
    assert.equal(modal1.subtitle, "¡Mueve la comida!");
    assert.equal(modal1.instruction, "Arrastra la comida.");
    assert.equal(modal1.confirmLabel, "¡A jugar!");

    const lvl2 = getLevelConfig(2);
    const modal2 = formatLevelIntroModal(lvl2);
    assert.equal(modal2.title, "Nivel 2");
    assert.equal(modal2.subtitle, "¡Sacude la comida!");
    assert.equal(modal2.instruction, "Sacúdela con fuerza.");
    assert.equal(modal2.confirmLabel, "¡A jugar!");
  });

  it("evaluates whether level gameplay can begin", () => {
    assert.equal(canStartLevelGameplay(true, false), false);
    assert.equal(canStartLevelGameplay(false, true), false);
    assert.equal(canStartLevelGameplay(true, true), false);
    assert.equal(canStartLevelGameplay(false, false), true);
  });
});
