export type GameModeName = 'normal' | 'hidden' | 'combination';

export type MaskCell = { kind: 'space' } | { kind: 'letter'; char: string | null };

export interface HintReveal {
  atElapsedMs: number;
  index: number;
}

/** Reveals are spread across this slice of the drawing window. */
const REVEAL_WINDOW_START = 0.4;
const REVEAL_WINDOW_END = 0.85;

export function buildMask(
  word: string,
  revealed: ReadonlySet<number>,
  mode: GameModeName,
): MaskCell[] {
  return [...word].map((char, index) => {
    if (char === ' ') return { kind: 'space' };
    if (mode === 'hidden') return { kind: 'letter', char: null };
    return { kind: 'letter', char: revealed.has(index) ? char : null };
  });
}

export function buildHintSchedule(input: {
  word: string;
  hints: number;
  drawTimeMs: number;
  mode: GameModeName;
  random: () => number;
}): HintReveal[] {
  const { word, hints, drawTimeMs, mode, random } = input;
  if (mode === 'hidden' || hints <= 0) return [];

  const letterIndices = [...word]
    .map((char, index) => (char === ' ' ? -1 : index))
    .filter((index) => index >= 0);

  const count = Math.min(hints, Math.floor(letterIndices.length / 2));
  if (count <= 0) return [];

  const shuffled = shuffle(letterIndices, random);
  const chosen = shuffled.slice(0, count);

  const start = drawTimeMs * REVEAL_WINDOW_START;
  const end = drawTimeMs * REVEAL_WINDOW_END;
  const step = count === 1 ? 0 : (end - start) / (count - 1);

  return chosen
    .map((index, i) => ({ index, atElapsedMs: Math.round(start + step * i) }))
    .sort((a, b) => a.atElapsedMs - b.atElapsedMs);
}

/** Fisher-Yates using the injected random source, so tests stay deterministic. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
