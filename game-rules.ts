export interface AntEscapeOutcome {
  score: number;
  spawnAnt: boolean;
}

export function resolveAntEscape(score: number, antSpawnRate: number): AntEscapeOutcome {
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
  const remainingFood = foodCount - 1;
  return {
    foodCount: remainingFood,
    gameOver: remainingFood === 0
  };
}

export function isNewHighScore(score: number, currentHighScore: number): boolean {
  return score > currentHighScore;
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

export interface Point {
  x: number;
  y: number;
}

export function pickNearestTarget<T extends Point>(
  originX: number,
  originY: number,
  targets: T[]
): T {
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
