import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { PAUSE_ABANDON_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

/** Two players, mid-turn, then the non-drawer leaves. */
function abandonedMidTurn(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 0 } });
  for (const id of ['p1', 'p2']) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
  }
  state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
  const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
  state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;
  const other = drawerId === 'p1' ? 'p2' : 'p1';
  return reduce(state, { type: 'PLAYER_LEFT', playerId: other }, ctxAt(1_000)).state;
}

describe('single-player pause', () => {
  it('records when the pause began', () => {
    const state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    expect(state.pausedSince).toBe(2_000);
  });

  it('does not drain the drawing clock while paused', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    const before = state.phase.name === 'drawing' ? state.phase.endsAt : 0;
    state = reduce(state, { type: 'TICK' }, ctxAt(12_000)).state;
    const after = state.phase.name === 'drawing' ? state.phase.endsAt : 0;
    expect(after).toBe(before + 10_000);
  });

  it('resumes when a second player joins', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p3', name: 'Cy', avatarSeed: 'c', ip: '3.3.3.3' }, ctxAt(3_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(3_100)).state;
    expect(state.pausedSince).toBeNull();
  });

  it('ends the game when nobody returns before the abandon timeout', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(2_000 + PAUSE_ABANDON_MS + 1)).state;
    expect(state.phase.name).toBe('game-end');
  });

  it('does not pause a lobby', () => {
    const ctx = ctxAt(0);
    let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: 'a' }, ctx).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(1_000)).state;
    expect(state.pausedSince).toBeNull();
  });
});
