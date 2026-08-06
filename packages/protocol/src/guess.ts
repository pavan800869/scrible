import { levenshteinAtMost, normalize } from './text.js';

export type GuessResult = 'correct' | 'close' | 'wrong';

/**
 * Words shorter than this are never reported as "close" — on a 3-letter
 * word a distance of 2 is a different word, not a typo.
 */
const MIN_LENGTH_FOR_CLOSE = 4;

export function classifyGuess(guess: string, word: string): GuessResult {
  const g = normalize(guess);
  const w = normalize(word);
  if (g.length === 0) return 'wrong';
  if (g === w) return 'correct';
  if (w.length < MIN_LENGTH_FOR_CLOSE) return 'wrong';

  const distance = levenshteinAtMost(g, w, 2);
  return distance !== null ? 'close' : 'wrong';
}
