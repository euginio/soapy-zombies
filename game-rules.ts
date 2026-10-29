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
  const remainingFood = Math.max(0, foodCount - 1);
  return {
    foodCount: remainingFood,
    gameOver: remainingFood <= 0
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
  gameOver = false,
  dragEnabled = true,
  isLevelTransitioning = false,
  isLevelIntroActive = false
): boolean {
  // Food can only be picked up when active, not being eaten, not on drag cooldown, while live,
  // not transitioning between levels, not waiting in level intro modal, and when dragging is enabled for the level.
  return (
    bodyEnabled &&
    !isBeingEaten &&
    !isDragCooldown &&
    !gameOver &&
    dragEnabled &&
    !isLevelTransitioning &&
    !isLevelIntroActive
  );
}

export function canFoodBeEaten(
  isBeingEaten: boolean,
  isBeingDragged: boolean,
  bodyEnabled = true,
  isBeingCarried = false
): boolean {
  // A food piece cannot be eaten if disabled, being eaten, being dragged, or being stolen by an ant.
  return bodyEnabled && !isBeingEaten && !isBeingDragged && !isBeingCarried;
}

export function findNearestTrayEdgePoint(
  x: number,
  y: number,
  trayBounds: Rect,
  exitDistance = 40
): Point {
  const left = trayBounds.x;
  const right = trayBounds.x + trayBounds.width;
  const top = trayBounds.y;
  const bottom = trayBounds.y + trayBounds.height;

  const distLeft = Math.abs(x - left);
  const distRight = Math.abs(right - x);
  const distTop = Math.abs(y - top);
  const distBottom = Math.abs(bottom - y);

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist === distLeft) {
    return { x: left - exitDistance, y: Math.max(top, Math.min(bottom, y)) };
  } else if (minDist === distRight) {
    return { x: right + exitDistance, y: Math.max(top, Math.min(bottom, y)) };
  } else if (minDist === distTop) {
    return { x: Math.max(left, Math.min(right, x)), y: top - exitDistance };
  } else {
    return { x: Math.max(left, Math.min(right, x)), y: bottom + exitDistance };
  }
}

export const MAX_CARRIER_ANTS = 4;

export function calculateCooperativeStealSpeed(
  baseSpeed: number,
  carrierCount: number,
  maxCarriers = MAX_CARRIER_ANTS
): number {
  if (carrierCount <= 0) {
    return 0;
  }
  const count = Math.min(carrierCount, maxCarriers);
  const multiplier = 0.4 + 0.3 * count;
  return baseSpeed * multiplier;
}

export function calculateCarrierAntOffset(
  index: number,
  totalCarriers: number,
  escapeAngle: number,
  radius = 18
): Point {
  if (totalCarriers <= 1) {
    const angle = escapeAngle + Math.PI;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  const spreadStart = escapeAngle + Math.PI / 2;
  const spreadEnd = escapeAngle + (3 * Math.PI) / 2;
  const step = (spreadEnd - spreadStart) / (totalCarriers - 1);
  const antAngle = spreadStart + index * step;

  return {
    x: Math.cos(antAngle) * radius,
    y: Math.sin(antAngle) * radius
  };
}

export function shouldTiltAffectAnt(
  isCarryingFood: boolean,
  tiltEnabled = true,
  isWaitingForNeutral = false
): boolean {
  return !isCarryingFood && tiltEnabled && !isWaitingForNeutral;
}

export function shouldTiltAffectCaterpillar(tiltEnabled = true): boolean {
  return tiltEnabled;
}

export const NEUTRAL_TILT_THRESHOLD = 0.15;
export const NEUTRAL_TILT_HOLD_MS = 300;

export function isTiltNeutral(
  tiltX: number,
  tiltY: number,
  maxNeutralThreshold = NEUTRAL_TILT_THRESHOLD
): boolean {
  return Math.hypot(tiltX, tiltY) <= maxNeutralThreshold;
}

export interface NeutralTiltProgress {
  isReady: boolean;
  durationMs: number;
}

export function checkNeutralTiltProgress(
  isCurrentlyNeutral: boolean,
  currentDurationMs: number,
  deltaMs: number,
  requiredDurationMs = NEUTRAL_TILT_HOLD_MS
): NeutralTiltProgress {
  if (!isCurrentlyNeutral) {
    return { isReady: false, durationMs: 0 };
  }
  const nextDuration = currentDurationMs + deltaMs;
  return {
    isReady: nextDuration >= requiredDurationMs,
    durationMs: nextDuration
  };
}

export interface BalanceBubblePosition {
  x: number;
  y: number;
  isNeutral: boolean;
  distance: number;
}

export function calculateBalanceBubblePosition(
  tiltX: number,
  tiltY: number,
  maxRadiusPx = 12,
  maxNeutralThreshold = NEUTRAL_TILT_THRESHOLD
): BalanceBubblePosition {
  const distance = Math.hypot(tiltX, tiltY);
  const isNeutral = distance <= maxNeutralThreshold;
  const clampScale = distance > 1 ? 1 / distance : 1;
  return {
    x: tiltX * clampScale * maxRadiusPx,
    y: tiltY * clampScale * maxRadiusPx,
    isNeutral,
    distance
  };
}

export function getBalanceFeedbackMessage(
  isNeutral: boolean,
  isDesktop = false
): string {
  if (isNeutral) {
    return "¡Mantén la posición!";
  }
  return isDesktop
    ? "Usa las flechas para nivelar"
    : "Mueve el teléfono para nivelar";
}

export function calculateBalanceHoldProgress(
  durationMs: number,
  requiredMs = NEUTRAL_TILT_HOLD_MS
): number {
  if (requiredMs <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, durationMs / requiredMs));
}

export function calculateAntStealVelocity(
  antX: number,
  antY: number,
  trayBounds: Rect,
  speed: number,
  gravityX: number = 0,
  gravityY: number = 0,
  gravityFactor: number = 0
): AntVelocity {
  const edge = findNearestTrayEdgePoint(antX, antY, trayBounds);
  const dx = antX - edge.x;
  const dy = antY - edge.y;
  // Ants carrying food are not affected by tray tilt; gravity is not applied.
  return calculateAntVelocity(dx, dy, speed, 0, 0, 0);
}

export function hasCarriedFoodExitedTray(
  foodBounds: Rect,
  trayBounds: Rect,
  carrierBounds: Rect[] = []
): boolean {
  if (!rectanglesOverlap(trayBounds, foodBounds)) {
    return true;
  }
  for (const ant of carrierBounds) {
    if (!rectanglesOverlap(trayBounds, ant)) {
      return true;
    }
  }
  return false;
}

export function isFoodInsideTray(
  foodX: number,
  foodY: number,
  trayBounds: Rect,
  margin = 0
): boolean {
  return (
    foodX >= trayBounds.x + margin &&
    foodX <= trayBounds.x + trayBounds.width - margin &&
    foodY >= trayBounds.y + margin &&
    foodY <= trayBounds.y + trayBounds.height - margin
  );
}

export function canAntStealFood(
  isAntAlive: boolean,
  isAntClimbing: boolean,
  antCarryingFood: boolean,
  carrierCount: number,
  isFoodBeingDragged: boolean,
  isFoodBeingEaten: boolean,
  isFoodBodyEnabled = true,
  maxCarriers = MAX_CARRIER_ANTS
): boolean {
  return (
    isAntAlive &&
    !isAntClimbing &&
    !antCarryingFood &&
    carrierCount < maxCarriers &&
    !isFoodBeingDragged &&
    !isFoodBeingEaten &&
    isFoodBodyEnabled
  );
}

export interface DragSample {
  x: number;
  y: number;
  time: number;
}

export interface FoodShakeOptions {
  windowMs?: number;
  minStrokeDistance?: number;
  minSegmentDistance?: number;
  minReversals?: number;
  minTotalDistance?: number;
}

export function detectFoodShake(
  samples: DragSample[],
  options: FoodShakeOptions = {}
): boolean {
  const windowMs = options.windowMs ?? 650;
  const minStrokeDistance = options.minStrokeDistance ?? options.minSegmentDistance ?? 6;
  const minReversals = options.minReversals ?? 2;
  const minTotalDistance = options.minTotalDistance ?? 25;

  if (samples.length < 3) {
    return false;
  }

  const latestTime = samples[samples.length - 1].time;
  const recent = samples.filter((sample) => sample.time >= latestTime - windowMs && sample.time <= latestTime);
  if (recent.length < 3) {
    return false;
  }

  let strokeX = 0;
  let strokeY = 0;
  let reversals = 0;
  let totalDistance = 0;

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 1.5) {
      continue;
    }

    totalDistance += dist;
    const strokeLen = Math.hypot(strokeX, strokeY);

    if (strokeLen < 0.1) {
      strokeX = dx;
      strokeY = dy;
      continue;
    }

    const dot = dx * strokeX + dy * strokeY;
    if (dot < 0) {
      if (strokeLen >= minStrokeDistance) {
        reversals++;
      }
      strokeX = dx;
      strokeY = dy;
    } else {
      strokeX += dx;
      strokeY += dy;
    }
  }

  return reversals >= minReversals && totalDistance >= minTotalDistance;
}

export function calculateRandomTrayPosition(
  trayBounds: Rect,
  margin = 25,
  randomXRatio = Math.random(),
  randomYRatio = Math.random()
): Point {
  const minX = trayBounds.x + margin;
  const maxX = trayBounds.x + trayBounds.width - margin;
  const minY = trayBounds.y + margin;
  const maxY = trayBounds.y + trayBounds.height - margin;

  return {
    x: minX + randomXRatio * Math.max(0, maxX - minX),
    y: minY + randomYRatio * Math.max(0, maxY - minY)
  };
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
  const overlappingFoods = existingFoods.filter((other) =>
    areFoodsOverlapping(clamped, other, minDistance)
  );
  if (overlappingFoods.length === 0) {
    return clamped;
  }

  // Sort overlapping foods so the closest obstacle to the drop position is handled first
  overlappingFoods.sort((a, b) => {
    const da = (a.x - clamped.x) ** 2 + (a.y - clamped.y) ** 2;
    const db = (b.x - clamped.x) ** 2 + (b.y - clamped.y) ** 2;
    return da - db;
  });

  const distanceMultipliers = [1.05, 1.25, 1.5, 1.75, 2.0];
  const angleSteps = 24;

  for (const target of overlappingFoods) {
    let baseAngle = 0;
    const distToTarget = Math.hypot(clamped.x - target.x, clamped.y - target.y);
    if (distToTarget > 0.001) {
      baseAngle = Math.atan2(clamped.y - target.y, clamped.x - target.x);
    } else {
      const distToOrigin = Math.hypot(clamped.x - origin.x, clamped.y - origin.y);
      if (distToOrigin > 0.001) {
        baseAngle = Math.atan2(clamped.y - origin.y, clamped.x - origin.x);
      }
    }

    for (const mult of distanceMultipliers) {
      const searchDist = minDistance * mult;
      let bestCandidate: Point | null = null;
      let bestDistSq = Infinity;

      for (let i = 0; i < angleSteps; i++) {
        const stepIndex = Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
        const angle = baseAngle + (stepIndex * 2 * Math.PI) / angleSteps;

        const rawX = target.x + searchDist * Math.cos(angle);
        const rawY = target.y + searchDist * Math.sin(angle);
        const clampedSpot = clampFoodPosition(rawX, rawY, trayBounds, margin);

        const overlapsAny = existingFoods.some((other) =>
          areFoodsOverlapping(clampedSpot, other, minDistance)
        );

        if (!overlapsAny) {
          const distSq = (clampedSpot.x - clamped.x) ** 2 + (clampedSpot.y - clamped.y) ** 2;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestCandidate = clampedSpot;
          }
        }
      }

      if (bestCandidate) {
        return bestCandidate;
      }
    }
  }

  // If no adjacent free space could be found, return to origin
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

export const TUTORIAL_STORAGE_KEY = "tutorialCompleted";

export function isTutorialCompleted(storedValue: string | null | undefined): boolean {
  return storedValue === "true" || storedValue === "1";
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

/**
 * Determines whether an ant should search/wander for food when no target is available.
 * Active when food exists in the level and is being dragged (or no target can be reached).
 */
export function shouldAntSearchForFood(
  hasFoodTarget: boolean,
  activeFoodCount: number,
  isFoodBeingDragged: boolean
): boolean {
  if (hasFoodTarget) {
    return false;
  }
  return activeFoodCount > 0 && isFoodBeingDragged;
}

/**
 * Checks whether an ant position is within the boundary avoidance margin of the tray.
 */
export function isNearTrayEdge(
  x: number,
  y: number,
  trayBounds: Rect,
  margin = 35
): boolean {
  return (
    x < trayBounds.x + margin ||
    x > trayBounds.x + trayBounds.width - margin ||
    y < trayBounds.y + margin ||
    y > trayBounds.y + trayBounds.height - margin
  );
}

/**
 * Calculates the next wander heading for an ant searching for food.
 * If the ant is near the tray edge and moving toward it, steers heading back toward tray center.
 * Otherwise, allows gentle wandering or changes heading when retarget interval expires.
 */
export function calculateAntSearchHeading(
  currentX: number,
  currentY: number,
  currentHeading: number,
  trayBounds: Rect,
  options?: {
    margin?: number;
    shouldPickNewAngle?: boolean;
    randomAngle?: number;
  }
): number {
  const margin = options?.margin ?? 35;
  const centerX = trayBounds.x + trayBounds.width / 2;
  const centerY = trayBounds.y + trayBounds.height / 2;

  const nearLeft = currentX < trayBounds.x + margin;
  const nearRight = currentX > trayBounds.x + trayBounds.width - margin;
  const nearTop = currentY < trayBounds.y + margin;
  const nearBottom = currentY > trayBounds.y + trayBounds.height - margin;

  const movingLeft = Math.cos(currentHeading) < 0;
  const movingRight = Math.cos(currentHeading) > 0;
  const movingUp = Math.sin(currentHeading) < 0;
  const movingDown = Math.sin(currentHeading) > 0;

  const headingTowardEdge =
    (nearLeft && movingLeft) ||
    (nearRight && movingRight) ||
    (nearTop && movingUp) ||
    (nearBottom && movingDown);

  if (headingTowardEdge) {
    return Math.atan2(centerY - currentY, centerX - currentX);
  }

  if (options?.shouldPickNewAngle && typeof options.randomAngle === "number") {
    return options.randomAngle;
  }

  return currentHeading;
}

/**
 * Calculates velocity for an ant searching for food, combining wandering walking speed with tray gravity.
 */
export function calculateAntSearchVelocity(
  heading: number,
  antSpeed: number,
  gravityX: number,
  gravityY: number,
  gravityFactor: number
): AntVelocity {
  const walkingX = Math.cos(heading) * antSpeed;
  const walkingY = Math.sin(heading) * antSpeed;

  return {
    x: walkingX + gravityX * gravityFactor,
    y: walkingY + gravityY * gravityFactor
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

export function shouldKeepScreenAwake(isGameActive: boolean, isDocumentVisible: boolean): boolean {
  return isGameActive && isDocumentVisible;
}

export function isScreenWakeLockSupported(nav?: { wakeLock?: unknown }): boolean {
  return Boolean(nav && "wakeLock" in nav && nav.wakeLock != null);
}
export function isWormTouchingFood(
  worm: Point,
  food: Point,
  touchDistance = 46
): boolean {
  const dx = worm.x - food.x;
  const dy = worm.y - food.y;
  return dx * dx + dy * dy <= touchDistance * touchDistance;
}

export function shouldWormContinueEating(options: {
  isTouching: boolean;
  isAlive: boolean;
  isClimbing: boolean;
  isFoodDragged: boolean;
  isFoodCarried: boolean;
}): boolean {
  return (
    options.isTouching &&
    options.isAlive &&
    !options.isClimbing &&
    !options.isFoodDragged &&
    !options.isFoodCarried
  );
}
export type LevelGoalType = "move_food" | "shake_ants" | "survive_time" | "defeat_ants" | "endless";

export interface LevelConfig {
  level: number;
  isTutorial?: boolean;
  title: string;
  subtitle: string;
  instruction: string;
  tiltEnabled: boolean;
  dragEnabled: boolean;
  caterpillarsEnabled: boolean;
  initialFood?: number;
  initialAnts: number;
  initialCaterpillars: number;
  antSpeed: number;
  goalType: LevelGoalType;
  goalTarget: number;
  foodCarriedByAnt?: boolean;
  antInCenter?: boolean;
  waitForNeutralTilt?: boolean;
}

export const TUTORIAL_CONFIGS: Record<number, LevelConfig> = {
  1: {
    level: 1,
    isTutorial: true,
    title: "Tutorial 1",
    subtitle: "¡Mueve la comida!",
    instruction: "Arrastra la comida.",
    tiltEnabled: false,
    dragEnabled: true,
    caterpillarsEnabled: false,
    initialFood: 1,
    initialAnts: 0,
    initialCaterpillars: 0,
    antSpeed: 45,
    goalType: "move_food",
    goalTarget: 1
  },
  2: {
    level: 2,
    isTutorial: true,
    title: "Tutorial 2",
    subtitle: "¡Sacude la comida!",
    instruction: "Sacúdela con fuerza.",
    tiltEnabled: false,
    dragEnabled: true,
    caterpillarsEnabled: false,
    initialFood: 1,
    initialAnts: 1,
    initialCaterpillars: 0,
    antSpeed: 0,
    goalType: "shake_ants",
    goalTarget: 1,
    foodCarriedByAnt: true
  },
  3: {
    level: 3,
    isTutorial: true,
    title: "Tutorial 3",
    subtitle: "¡Inclina la bandeja!",
    instruction: "Tira la hormiga.",
    tiltEnabled: true,
    dragEnabled: false,
    caterpillarsEnabled: false,
    initialFood: 0,
    initialAnts: 1,
    initialCaterpillars: 0,
    antSpeed: 50,
    goalType: "defeat_ants",
    goalTarget: 1,
    antInCenter: true,
    waitForNeutralTilt: true
  }
};

export const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: {
    level: 1,
    isTutorial: false,
    title: "Nivel 1",
    subtitle: "¡Defensa total!",
    instruction: "Defiende la comida. Tira 20 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: false,
    initialAnts: 5,
    initialCaterpillars: 0,
    antSpeed: 58,
    goalType: "defeat_ants",
    goalTarget: 20
  },
  2: {
    level: 2,
    isTutorial: false,
    title: "Nivel 2",
    subtitle: "¡Cuidado con las orugas!",
    instruction: "Tira 25 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 5,
    initialCaterpillars: 1,
    antSpeed: 62,
    goalType: "defeat_ants",
    goalTarget: 25
  },
  3: {
    level: 3,
    isTutorial: false,
    title: "Nivel 3",
    subtitle: "¡Enjambre de hormigas!",
    instruction: "Tira 30 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 6,
    initialCaterpillars: 1,
    antSpeed: 66,
    goalType: "defeat_ants",
    goalTarget: 30
  },
  4: {
    level: 4,
    isTutorial: false,
    title: "Nivel 4",
    subtitle: "¡Ataque veloz!",
    instruction: "Tira 35 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 6,
    initialCaterpillars: 1,
    antSpeed: 70,
    goalType: "defeat_ants",
    goalTarget: 35
  },
  5: {
    level: 5,
    isTutorial: false,
    title: "Nivel 5",
    subtitle: "¡Doble problema!",
    instruction: "Tira 40 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 7,
    initialCaterpillars: 2,
    antSpeed: 74,
    goalType: "defeat_ants",
    goalTarget: 40
  },
  6: {
    level: 6,
    isTutorial: false,
    title: "Nivel 6",
    subtitle: "¡Pánico en el picnic!",
    instruction: "Tira 45 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 7,
    initialCaterpillars: 2,
    antSpeed: 78,
    goalType: "defeat_ants",
    goalTarget: 45
  },
  7: {
    level: 7,
    isTutorial: false,
    title: "Nivel 7",
    subtitle: "¡Gran festín!",
    instruction: "Tira 50 hormigas.",
    tiltEnabled: true,
    dragEnabled: true,
    caterpillarsEnabled: true,
    initialAnts: 8,
    initialCaterpillars: 2,
    antSpeed: 82,
    goalType: "defeat_ants",
    goalTarget: 50
  }
};

export function getTutorialConfig(level: number): LevelConfig {
  if (level in TUTORIAL_CONFIGS) {
    return TUTORIAL_CONFIGS[level];
  }
  return TUTORIAL_CONFIGS[1];
}

export function getLevelConfig(level: number, isTutorial = false): LevelConfig {
  if (isTutorial) {
    return getTutorialConfig(level);
  }
  if (level in LEVEL_CONFIGS) {
    return LEVEL_CONFIGS[level];
  }
  const base = LEVEL_CONFIGS[7];
  const extraLevels = level - 7;
  return {
    ...base,
    level,
    isTutorial: false,
    title: "Nivel " + level,
    subtitle: "¡Caos infinito!",
    instruction: "Tira " + (50 + extraLevels * 10) + " hormigas.",
    goalType: "defeat_ants",
    goalTarget: 50 + extraLevels * 10,
    antSpeed: Math.min(95, base.antSpeed + extraLevels * 2),
    initialAnts: Math.min(10, base.initialAnts + Math.floor(extraLevels / 2)),
    initialCaterpillars: Math.min(3, base.initialCaterpillars + (level >= 12 ? 1 : 0))
  };
}

export function isLevelGoalMet(
  goalType: LevelGoalType,
  currentProgress: number,
  target: number
): boolean {
  if (goalType === "endless") {
    return false;
  }
  return currentProgress >= target;
}

export function formatLevelObjective(
  config: LevelConfig,
  currentProgress: number,
  isWaitingForNeutral = false
): string {
  if (isWaitingForNeutral) {
    return "NIVELA LA BANDEJA";
  }
  switch (config.goalType) {
    case "move_food":
      return `MUEVE LA COMIDA: ${Math.min(Math.floor(currentProgress), config.goalTarget)}/${config.goalTarget}`;
    case "shake_ants":
      return `SACUDE LA COMIDA: ${Math.min(Math.floor(currentProgress), config.goalTarget)}/${config.goalTarget}`;
    case "survive_time": {
      const remaining = Math.max(0, Math.ceil(config.goalTarget - currentProgress));
      return `SOBREVIVE: ${remaining}s`;
    }
    case "defeat_ants":
      return `HORMIGAS: ${Math.min(Math.floor(currentProgress), config.goalTarget)}/${config.goalTarget}`;
    case "endless":
      return "INFINITO";
  }
}

export const FINAL_WAVE_PROGRESS_THRESHOLD = 0.7;

export function isFinalWaveTriggered(
  currentProgress: number,
  target: number,
  thresholdRatio = FINAL_WAVE_PROGRESS_THRESHOLD
): boolean {
  if (target <= 0) {
    return false;
  }
  return currentProgress / target >= thresholdRatio;
}

export function calculateWaveExtraAnts(level: number): number {
  if (level <= 4) {
    return 2;
  }
  return 3;
}

export interface LevelCompleteSummary {
  completedLevel: number;
  isCompletedTutorial: boolean;
  nextLevel: number;
  isNextTutorial: boolean;
  title: string;
  nextTitle: string;
  nextSubtitle: string;
  nextInstruction: string;
}

export function formatLevelCompleteSummary(
  currentLevel: number,
  isTutorial = false
): LevelCompleteSummary {
  const completedLevel = currentLevel;
  if (isTutorial) {
    if (completedLevel < 3) {
      const nextLevel = completedLevel + 1;
      const nextConfig = getLevelConfig(nextLevel, true);
      return {
        completedLevel,
        isCompletedTutorial: true,
        nextLevel,
        isNextTutorial: true,
        title: "¡Tutorial " + completedLevel + " completado!",
        nextTitle: nextConfig.title,
        nextSubtitle: nextConfig.subtitle,
        nextInstruction: nextConfig.instruction
      };
    }
    // Tutorial 3 finished -> Next is Game Level 1!
    const nextConfig = getLevelConfig(1, false);
    return {
      completedLevel,
      isCompletedTutorial: true,
      nextLevel: 1,
      isNextTutorial: false,
      title: "¡Tutorial completado!",
      nextTitle: nextConfig.title,
      nextSubtitle: nextConfig.subtitle,
      nextInstruction: nextConfig.instruction
    };
  }

  const nextLevel = completedLevel + 1;
  const nextConfig = getLevelConfig(nextLevel, false);
  return {
    completedLevel,
    isCompletedTutorial: false,
    nextLevel,
    isNextTutorial: false,
    title: "¡Nivel " + completedLevel + " completado!",
    nextTitle: nextConfig.title,
    nextSubtitle: nextConfig.subtitle,
    nextInstruction: nextConfig.instruction
  };
}

export function canShowLevelComplete(gameOver: boolean, isLevelCompleteActive: boolean): boolean {
  return !gameOver && !isLevelCompleteActive;
}

export interface PauseMenuSummary {
  levelNumber: number;
  isTutorial: boolean;
  levelTitle: string;
  levelSubtitle: string;
  score: number;
  highScore: number;
  isMuted: boolean;
}

export function formatPauseMenuSummary(
  levelNumber: number,
  score: number,
  highScore: number,
  isMuted: boolean,
  isTutorial = false
): PauseMenuSummary {
  const config = getLevelConfig(levelNumber, isTutorial);
  return {
    levelNumber,
    isTutorial,
    levelTitle: config.title,
    levelSubtitle: config.subtitle,
    score,
    highScore,
    isMuted
  };
}

export function canPauseGame(
  gameOver: boolean,
  isLevelCompleteActive = false,
  isLevelIntroActive = false
): boolean {
  return !gameOver && !isLevelCompleteActive && !isLevelIntroActive;
}

export function togglePauseState(
  currentPaused: boolean,
  gameOver: boolean,
  isLevelCompleteActive = false,
  isLevelIntroActive = false
): boolean {
  if (!canPauseGame(gameOver, isLevelCompleteActive, isLevelIntroActive)) {
    return false;
  }
  return !currentPaused;
}

export interface LevelIntroModalInfo {
  title: string;
  subtitle: string;
  instruction: string;
  confirmLabel: string;
}

export function formatLevelIntroModal(config: LevelConfig): LevelIntroModalInfo {
  return {
    title: config.title,
    subtitle: config.subtitle,
    instruction: config.instruction,
    confirmLabel: "¡A jugar!"
  };
}

export function canStartLevelGameplay(isLevelIntroActive: boolean, gameOver: boolean): boolean {
  return !isLevelIntroActive && !gameOver;
}
