export interface AntEscapeOutcome {
  score: number;
  spawnAnt: boolean;
}

export const CATERPILLAR_SPEED = 24;
export const CATERPILLAR_GRAVITY_FACTOR = 3.5;
export const CATERPILLAR_FALL_SCORE = 2;

export interface InchingScale {
  scaleX: number;
  scaleY: number;
}

export function calculateWormInchingScale(
  cycleMs: number,
  periodMs = 600
): InchingScale {
  const phase = (cycleMs % periodMs) / periodMs;
  const sine = Math.sin(phase * Math.PI * 2);
  return {
    scaleX: 1 - 0.12 * sine,
    scaleY: 1 + 0.2 * sine
  };
}

export interface CaterpillarEscapeOutcome {
  score: number;
  pointsAwarded: number;
}

export function resolveCaterpillarEscape(score: number): CaterpillarEscapeOutcome {
  return {
    score: score + CATERPILLAR_FALL_SCORE,
    pointsAwarded: CATERPILLAR_FALL_SCORE
  };
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

export const FOOD_MAX_DRAG_MS = 3000;
export const FOOD_DRAG_COOLDOWN_MS = 1500;
export const FOOD_EAT_DURATION_MS = 1500;

export interface FoodBiteStep {
  progress: number;
  x: number;
  y: number;
  radius: number;
}

export function getFoodBiteSequence(incomingAngle: number): FoodBiteStep[] {
  // Food sprite frame is 32x32 with center at (16, 16).
  // Bites progressively consume the food from the incoming ant edge inwards.
  return [
    {
      progress: 0.05,
      x: 16 + Math.cos(incomingAngle) * 9,
      y: 16 + Math.sin(incomingAngle) * 9,
      radius: 7
    },
    {
      progress: 0.24,
      x: 16 + Math.cos(incomingAngle + 0.85) * 8,
      y: 16 + Math.sin(incomingAngle + 0.85) * 8,
      radius: 7.5
    },
    {
      progress: 0.44,
      x: 16 + Math.cos(incomingAngle - 0.85) * 8,
      y: 16 + Math.sin(incomingAngle - 0.85) * 8,
      radius: 7.5
    },
    {
      progress: 0.64,
      x: 16 + Math.cos(incomingAngle) * 3,
      y: 16 + Math.sin(incomingAngle) * 3,
      radius: 9
    },
    {
      progress: 0.82,
      x: 16 - Math.cos(incomingAngle) * 4,
      y: 16 - Math.sin(incomingAngle) * 4,
      radius: 10
    },
    {
      progress: 0.94,
      x: 16,
      y: 16,
      radius: 16
    }
  ];
}

export function getActiveFoodBites(
  progress: number,
  sequence: FoodBiteStep[]
): FoodBiteStep[] {
  return sequence.filter((step) => step.progress <= progress);
}

export function canFoodBeDragged(
  isBeingEaten: boolean,
  isDragCooldown: boolean,
  bodyEnabled = true,
  gameOver = false
): boolean {
  // Food can only be picked up when active, not being eaten, not on drag cooldown, and while the round is live.
  return bodyEnabled && !isBeingEaten && !isDragCooldown && !gameOver;
}

export function canFoodBeEaten(
  isBeingEaten: boolean,
  isBeingDragged: boolean,
  bodyEnabled = true
): boolean {
  // A food piece cannot be eaten if it is disabled, already being eaten, or currently being dragged by the player.
  return bodyEnabled && !isBeingEaten && !isBeingDragged;
}

export function clampFoodPosition(
  x: number,
  y: number,
  trayBounds: Rect,
  margin = 20
): Point {
  // Keep dragged food safely inside the tray surface so it remains reachable by ants.
  const minX = trayBounds.x + margin;
  const maxX = trayBounds.x + trayBounds.width - margin;
  const minY = trayBounds.y + margin;
  const maxY = trayBounds.y + trayBounds.height - margin;

  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y))
  };
}

export function areFoodsOverlapping(
  a: Point,
  b: Point,
  minDistance = 32
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < minDistance * minDistance;
}

export function resolveFoodDropPosition(
  candidate: Point,
  existingFoods: Point[],
  trayBounds: Rect,
  origin: Point,
  minDistance = 32,
  margin = 25
): Point {
  const clamped = clampFoodPosition(candidate.x, candidate.y, trayBounds, margin);
  const overlapsAny = existingFoods.some((other) =>
    areFoodsOverlapping(clamped, other, minDistance)
  );
  if (!overlapsAny) {
    return clamped;
  }
  return clampFoodPosition(origin.x, origin.y, trayBounds, margin);
}

export function isNewHighScore(score: number, currentHighScore: number): boolean {
  return score > currentHighScore;
}

export function parseStoredHighScore(storedValue: string | null | undefined): number {
  // Missing, corrupted or negative storage values must never break the game: treat them as no record.
  const parsed = Number.parseInt(storedValue ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseStoredMuted(storedValue: string | null | undefined): boolean {
  // Audio is on by default: only an explicit "1" written by the mute button means muted.
  return storedValue === "1";
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

export function getScreenOrientationAngle(
  screenAngle?: number | null,
  windowOrientation?: number | string | null
): number {
  // Screen Orientation API is standard; iOS Safari and older browsers use window.orientation.
  if (typeof screenAngle === "number" && !Number.isNaN(screenAngle)) {
    return screenAngle;
  }
  if (typeof windowOrientation === "number" && !Number.isNaN(windowOrientation)) {
    return windowOrientation;
  }
  if (typeof windowOrientation === "string") {
    const parsed = Number.parseInt(windowOrientation, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
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
  let screenX = deltaGamma * Math.cos(angle) + deltaBeta * Math.sin(angle);
  let screenY = deltaBeta * Math.cos(angle) - deltaGamma * Math.sin(angle);
  if (Math.abs(screenX) < 1e-10) screenX = 0;
  if (Math.abs(screenY) < 1e-10) screenY = 0;

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
  let screenX = portraitX * Math.cos(angle) + portraitY * Math.sin(angle);
  let screenY = portraitY * Math.cos(angle) - portraitX * Math.sin(angle);
  if (Math.abs(screenX) < 1e-10) screenX = 0;
  if (Math.abs(screenY) < 1e-10) screenY = 0;

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
