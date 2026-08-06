import type { Difficulty, GameMode } from '@scrible/protocol';
import { WORDS } from './list.js';

export { WORDS };

export interface WordEntry {
  text: string;
  difficulty: Difficulty;
  category: string;
}

export function pickWords(input: {
  count: number;
  exclude: readonly string[];
  customWords: readonly string[];
  customWordsOnly: boolean;
  mode: GameMode;
  random: () => number;
}): WordEntry[] {
  const { count, mode, random } = input;
  const perEntry = mode === 'combination' ? 2 : 1;
  const needed = count * perEntry;

  const pool = buildPool(input);
  const excluded = new Set(input.exclude);

  let candidates = pool.filter((w) => !excluded.has(w.text));
  // Exhausted pool: reuse rather than fail. A repeated word beats a stalled game.
  if (candidates.length < needed) candidates = pool;

  const drawn = drawDistinct(candidates, needed, random);

  if (mode !== 'combination') return drawn;

  return Array.from({ length: count }, (_, i) => {
    const a = drawn[i * 2] as WordEntry;
    const b = drawn[i * 2 + 1] as WordEntry;
    return {
      text: `${a.text} ${b.text}`,
      difficulty: 'hard' as Difficulty,
      category: `${a.category}+${b.category}`,
    };
  });
}

function buildPool(input: {
  customWords: readonly string[];
  customWordsOnly: boolean;
}): WordEntry[] {
  const custom: WordEntry[] = input.customWords.map((text) => ({
    text: text.toLowerCase().trim(),
    difficulty: 'medium',
    category: 'custom',
  }));

  if (input.customWordsOnly) return custom;
  return custom.length > 0 ? [...WORDS, ...custom] : WORDS;
}

function drawDistinct(pool: readonly WordEntry[], count: number, random: () => number): WordEntry[] {
  const taken = new Set<number>();
  const out: WordEntry[] = [];

  // Bounded attempts, then a linear sweep, so this can never spin forever.
  for (let attempt = 0; attempt < count * 20 && out.length < count; attempt++) {
    const index = Math.floor(random() * pool.length);
    if (taken.has(index)) continue;
    taken.add(index);
    out.push(pool[index] as WordEntry);
  }
  for (let i = 0; out.length < count && i < pool.length; i++) {
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(pool[i] as WordEntry);
  }
  // Pool smaller than count: pad by repeating.
  for (let i = 0; out.length < count; i++) {
    out.push(pool[i % pool.length] as WordEntry);
  }
  return out;
}
