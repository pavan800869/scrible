import { describe, expect, it } from 'vitest';
import { buildHintSchedule, buildMask } from '../src/hints.js';

const fixedRandom = () => 0.42;

describe('buildMask', () => {
  it('masks every letter when nothing is revealed', () => {
    expect(buildMask('cat', new Set(), 'normal')).toEqual([
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
    ]);
  });

  it('marks spaces distinctly so word breaks are visible', () => {
    const mask = buildMask('ice cream', new Set(), 'normal');
    expect(mask[3]).toEqual({ kind: 'space' });
    expect(mask).toHaveLength(9);
  });

  it('reveals the requested indices', () => {
    const mask = buildMask('cat', new Set([0]), 'normal');
    expect(mask[0]).toEqual({ kind: 'letter', char: 'c' });
    expect(mask[1]).toEqual({ kind: 'letter', char: null });
  });

  it('never reveals a letter in hidden mode', () => {
    const mask = buildMask('cat', new Set([0, 1, 2]), 'hidden');
    expect(mask.every((cell) => cell.kind === 'space' || cell.char === null)).toBe(true);
  });
});

describe('buildHintSchedule', () => {
  it('returns nothing when hints are disabled', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 0, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toEqual([]);
  });

  it('returns nothing in hidden mode even when hints are configured', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'hidden', random: fixedRandom,
    });
    expect(schedule).toEqual([]);
  });

  it('never reveals more than half the letters', () => {
    const schedule = buildHintSchedule({
      word: 'cat', hints: 5, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toHaveLength(1);
  });

  it('reveals distinct indices in increasing time order', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toHaveLength(3);
    expect(new Set(schedule.map((r) => r.index)).size).toBe(3);
    const times = schedule.map((r) => r.atElapsedMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('places every reveal inside the drawing window', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    for (const reveal of schedule) {
      expect(reveal.atElapsedMs).toBeGreaterThan(0);
      expect(reveal.atElapsedMs).toBeLessThan(80_000);
    }
  });

  it('never schedules a reveal on a space', () => {
    const schedule = buildHintSchedule({
      word: 'ice cream', hints: 4, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    for (const reveal of schedule) {
      expect('ice cream'[reveal.index]).not.toBe(' ');
    }
  });
});
