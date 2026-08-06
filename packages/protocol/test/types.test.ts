import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DRAW_TIME_STEPS, roomSettingsSchema } from '../src/types.js';

describe('roomSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(roomSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects a draw time outside the allowed steps', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, drawTimeSec: 77 });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than two players', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxPlayers: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects more than twenty players', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxPlayers: 21 });
    expect(result.success).toBe(false);
  });

  it('rejects more than five hints', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, hints: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects customWordsOnly with an empty custom list', () => {
    const result = roomSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS, customWordsOnly: true, customWords: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts customWordsOnly with enough custom words', () => {
    const result = roomSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      customWordsOnly: true,
      customWords: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'],
    });
    expect(result.success).toBe(true);
  });
});

describe('DRAW_TIME_STEPS', () => {
  it('spans the documented range', () => {
    expect(DRAW_TIME_STEPS[0]).toBe(15);
    expect(DRAW_TIME_STEPS.at(-1)).toBe(240);
  });
});
