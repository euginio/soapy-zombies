import assert = require("node:assert/strict");
import { describe, it } from "node:test";
import {
  calculateAntVelocity,
  calculateDeviceMotionTilt,
  calculateDeviceTilt,
  canFoodBeEaten,
  clampFoodPosition,
  getScreenOrientationAngle,
  calculateVisualLayerLayout,
  debugColorToTint,
  insetHorizontalTrayBounds,
  isNewHighScore,
  isTabletDevice,
  parseStoredHighScore,
  parseStoredMuted,
  pickNearestTarget,
  rectanglesOverlap,
  resolveAntEscape,
  resolveFoodLoss
} from "../game-rules";

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
