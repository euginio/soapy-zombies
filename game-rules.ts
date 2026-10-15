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
