import assert = require("node:assert/strict");
import { describe, it } from "node:test";
import {
  calculateAntVelocity,
  calculateDeviceTilt,
  isNewHighScore,
  isTabletDevice,
  resolveAntEscape,
  resolveFoodLoss
} from "../game-rules";

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
});

describe("mobile device tilt", () => {
  it("maps portrait orientation changes to horizontal and vertical tilt", () => {
    assert.deepEqual(calculateDeviceTilt(15, -15, 0, 0, 0), {
      x: -0.5,
      y: 0.5
    });
  });

  it("maps sensor axes to screen axes in landscape orientation", () => {
    const tilt = calculateDeviceTilt(30, 0, 0, 0, 90);
    assert.ok(Math.abs(tilt.x - 1) < 1e-10);
    assert.ok(Math.abs(tilt.y) < 1e-10);
  });

  it("clamps extreme device angles to the supported tilt range", () => {
    assert.deepEqual(calculateDeviceTilt(90, -90, 0, 0, 0), {
      x: -1,
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
});

describe("food loss", () => {
  it("reduces the remaining food without ending the game", () => {
    assert.deepEqual(resolveFoodLoss(2), { foodCount: 1, gameOver: false });
  });

  it("ends the game when the final food is eaten", () => {
    assert.deepEqual(resolveFoodLoss(1), { foodCount: 0, gameOver: true });
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
});
