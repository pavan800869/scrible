import { describe, expect, it } from 'vitest';
import { DRAWER_SCORE_CAP, drawerScore, guesserScore } from '../src/score.js';

describe('guesserScore', () => {
  it('awards the maximum when no time has elapsed', () => {
    expect(guesserScore({ timeRemainingMs: 80_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(400);
  });

  it('awards the floor when time has run out', () => {
    expect(guesserScore({ timeRemainingMs: 0, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(100);
  });

  it('scales linearly at the halfway point', () => {
    expect(guesserScore({ timeRemainingMs: 40_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(250);
  });

  it('applies the hard-word multiplier', () => {
    expect(guesserScore({ timeRemainingMs: 80_000, drawTimeMs: 80_000, difficulty: 'hard' })).toBe(520);
  });

  it('clamps negative remaining time to zero', () => {
    expect(guesserScore({ timeRemainingMs: -5_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(100);
  });
});

describe('drawerScore', () => {
  it('scores zero when nobody guessed', () => {
    expect(drawerScore({ guesserScores: [], otherPlayerCount: 3 })).toBe(0);
  });

  it('scores the full mean when everyone guessed', () => {
    expect(drawerScore({ guesserScores: [200, 300], otherPlayerCount: 2 })).toBe(250);
  });

  it('scales down when only some guessed', () => {
    expect(drawerScore({ guesserScores: [200], otherPlayerCount: 4 })).toBe(50);
  });

  it('caps the drawer score', () => {
    expect(drawerScore({ guesserScores: [520, 520], otherPlayerCount: 2 })).toBe(DRAWER_SCORE_CAP);
  });

  it('scores zero when there are no other players', () => {
    expect(drawerScore({ guesserScores: [], otherPlayerCount: 0 })).toBe(0);
  });
});
