export interface AntEscapeOutcome {
  score: number;
  spawnAnt: boolean;
}

export function resolveAntEscape(score: number, antSpawnRate: number): AntEscapeOutcome {
  // The score is also the counter used to decide when the next ant appears.
  const nextScore = score + 1;
  return {
    score: nextScore,
    spawnAnt: nextScore % antSpawnRate === 0
  };
}

export interface FoodLossOutcome {
  foodCount: number;
  gameOver: boolean;
}

export function resolveFoodLoss(foodCount: number): FoodLossOutcome {
  // The round ends exactly when the final piece of food is removed.
  const remainingFood = foodCount - 1;
  return {
    foodCount: remainingFood,
    gameOver: remainingFood === 0
  };
}

export function isNewHighScore(score: number, currentHighScore: number): boolean {
  return score > currentHighScore;
}

export function parseStoredHighScore(storedValue: string | null | undefined): number {
  // Missing, corrupted or negative storage values must never break the game: treat them as no record.
  const parsed = Number.parseInt(storedValue ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface AntVelocity {
  x: number;
  y: number;
}

export function calculateAntVelocity(
  xDistance: number,
  yDistance: number,
  antSpeed: number,
  gravityX: number,
  gravityY: number,
  gravityFactor: number
): AntVelocity {
  // Divide by the sum of axis distances so diagonal pursuit is not faster than straight pursuit.
  const totalDistance = Math.abs(xDistance) + Math.abs(yDistance);
  const directionX = totalDistance === 0 ? 0 : (-xDistance / totalDistance) * antSpeed;
  const directionY = totalDistance === 0 ? 0 : (-yDistance / totalDistance) * antSpeed;

  return {
    x: directionX + gravityX * gravityFactor,
    y: directionY + gravityY * gravityFactor
  };
}

export interface DeviceTilt {
  x: number;
  y: number;
}

export function isTabletDevice(
  userAgentMobile: boolean | undefined,
  platform: string,
  userAgent: string,
  maxTouchPoints: number,
  screenWidth: number,
  screenHeight: number
): boolean {
  if (maxTouchPoints < 1 || userAgentMobile === true) {
    return false;
  }

  if (/iPad/i.test(platform) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return true;
  }

  if (userAgentMobile === false && /Android/i.test(platform)) {
    return true;
  }

  if (/Tablet|PlayBook|Silk/i.test(userAgent)) {
    return true;
  }

  return Math.min(screenWidth, screenHeight) >= 600;
}

export function calculateDeviceTilt(
  beta: number,
  gamma: number,
  baselineBeta: number,
  baselineGamma: number,
  screenAngle: number,
  maxSensorAngle = 30
): DeviceTilt {
  // Rotate sensor axes into the current screen orientation, then normalize and clamp them.
  const angle = screenAngle * Math.PI / 180;
  const deltaBeta = beta - baselineBeta;
  const deltaGamma = gamma - baselineGamma;
  const screenX = deltaGamma * Math.cos(angle) + deltaBeta * Math.sin(angle);
  const screenY = deltaBeta * Math.cos(angle) - deltaGamma * Math.sin(angle);

  return {
    x: Math.max(-1, Math.min(1, screenX / maxSensorAngle)),
    y: Math.max(-1, Math.min(1, screenY / maxSensorAngle))
  };
}

export function calculateDeviceMotionTilt(
  accelerationX: number,
  accelerationY: number,
  screenAngle: number,
  maxAcceleration = 5
): DeviceTilt {
  // accelerationIncludingGravity reports the upward support force: tilting right (+gamma)
  // yields -x, while tilting toward the player (+beta) yields +y.
  const angle = screenAngle * Math.PI / 180;
  const portraitX = -accelerationX;
  const portraitY = accelerationY;
  const screenX = portraitX * Math.cos(angle) + portraitY * Math.sin(angle);
  const screenY = portraitY * Math.cos(angle) - portraitX * Math.sin(angle);

  return {
    x: Math.max(-1, Math.min(1, screenX / maxAcceleration)),
    y: Math.max(-1, Math.min(1, screenY / maxAcceleration))
  };
}

export interface Point {
  x: number;
  y: number;
}

export function debugColorToTint(debugColor: string): number {
  return Number.parseInt(debugColor.slice(1), 16);
}

export interface VisualLayerMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisualLayerLayout extends VisualLayerMetrics {
  scaleX: number;
  scaleY: number;
}

export function calculateVisualLayerLayout(
  metrics: VisualLayerMetrics,
  gameWidth: number,
  gameHeight: number
): VisualLayerLayout {
  // Convert canvas pixel dimensions into scale factors relative to the game's logical size.
  return {
    ...metrics,
    scaleX: metrics.width / gameWidth,
    scaleY: metrics.height / gameHeight
  };
}

export function pickNearestTarget<T extends Point>(
  originX: number,
  originY: number,
  targets: T[]
): T | null {
  // A missing target is represented explicitly so callers can stop movement safely.
  if (targets.length === 0) {
    return null;
  }
  return targets.reduce((nearest, current) => {
    const nearestDistance = Math.hypot(nearest.x - originX, nearest.y - originY);
    const currentDistance = Math.hypot(current.x - originX, current.y - originY);
    return currentDistance < nearestDistance ? current : nearest;
  });
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function insetHorizontalTrayBounds(tray: Rect, horizontalInset = 25): Rect {
  // Shrink the tray's side edges so ants can fall when they move beyond its usable surface.
  return {
    x: tray.x + horizontalInset,
    y: tray.y,
    width: tray.width - horizontalInset * 2,
    height: tray.height
  };
}

export function rectanglesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
