import { describe, expect, it } from 'vitest';
import { WORDS, pickWords } from '../src/index.js';

const base = {
  exclude: [] as string[],
  customWords: [] as string[],
  customWordsOnly: false,
  mode: 'normal' as const,
  random: () => 0.42,
};

describe('WORDS', () => {
  it('has a substantial list', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(300);
  });

  it('contains no duplicates', () => {
    expect(new Set(WORDS.map((w) => w.text)).size).toBe(WORDS.length);
  });

  it('covers every difficulty', () => {
    const difficulties = new Set(WORDS.map((w) => w.difficulty));
    expect(difficulties).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('has only lowercase words without leading or trailing space', () => {
    for (const word of WORDS) {
      expect(word.text).toBe(word.text.toLowerCase().trim());
    }
  });
});

describe('pickWords', () => {
  it('returns the requested count', () => {
    expect(pickWords({ ...base, count: 3 })).toHaveLength(3);
  });

  it('returns distinct words', () => {
    const picked = pickWords({ ...base, count: 5 });
    expect(new Set(picked.map((w) => w.text)).size).toBe(5);
  });

  it('honours the exclude list', () => {
    const first = pickWords({ ...base, count: 1 })[0]!;
    const second = pickWords({ ...base, count: 1, exclude: [first.text] })[0]!;
    expect(second.text).not.toBe(first.text);
  });

  it('uses only custom words when customWordsOnly is set', () => {
    const custom = ['zebra crossing', 'lava lamp', 'paper clip', 'tide pool', 'wind chime'];
    const picked = pickWords({ ...base, count: 3, customWords: custom, customWordsOnly: true });
    for (const word of picked) expect(custom).toContain(word.text);
  });

  it('rates custom words as medium', () => {
    const custom = ['zebra crossing', 'lava lamp', 'paper clip', 'tide pool', 'wind chime'];
    const picked = pickWords({ ...base, count: 1, customWords: custom, customWordsOnly: true });
    expect(picked[0]!.difficulty).toBe('medium');
  });

  it('returns two-word entries in combination mode', () => {
    const picked = pickWords({ ...base, count: 2, mode: 'combination' });
    for (const word of picked) expect(word.text.split(' ').length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to reusing words when the pool is exhausted', () => {
    const custom = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const picked = pickWords({
      ...base, count: 5, customWords: custom, customWordsOnly: true, exclude: custom,
    });
    expect(picked).toHaveLength(5);
  });
});
