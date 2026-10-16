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
