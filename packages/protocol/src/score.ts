export type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.3,
};

const GUESS_BASE = 100;
const GUESS_TIME_BONUS = 300;
export const DRAWER_SCORE_CAP = 350;

export function guesserScore(input: {
  timeRemainingMs: number;
  drawTimeMs: number;
  difficulty: Difficulty;
}): number {
  const { drawTimeMs, difficulty } = input;
  if (drawTimeMs <= 0) return 0;
  const remaining = Math.max(0, Math.min(input.timeRemainingMs, drawTimeMs));
  const raw = GUESS_BASE + Math.floor((GUESS_TIME_BONUS * remaining) / drawTimeMs);
  return Math.floor(raw * DIFFICULTY_MULTIPLIER[difficulty]);
}

export function drawerScore(input: {
  guesserScores: number[];
  otherPlayerCount: number;
}): number {
  const { guesserScores, otherPlayerCount } = input;
  if (otherPlayerCount <= 0 || guesserScores.length === 0) return 0;

  const mean = guesserScores.reduce((sum, n) => sum + n, 0) / guesserScores.length;
  const guessedFraction = Math.min(1, guesserScores.length / otherPlayerCount);
  return Math.min(DRAWER_SCORE_CAP, Math.floor(mean * guessedFraction));
}
