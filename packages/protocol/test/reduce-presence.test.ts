import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { SEAT_HOLD_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

function lobbyOfThree(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
  for (const id of ['p1', 'p2', 'p3']) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
  }
  return state;
}

describe('PLAYER_LEFT', () => {
  it('keeps the seat and marks the player disconnected', () => {
    const result = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000));
    const player = result.state.players.find((p) => p.id === 'p2');
    expect(player?.connected).toBe(false);
    expect(player?.seatExpiresAt).toBe(1_000 + SEAT_HOLD_MS);
  });

  it('migrates the host to the longest-connected remaining player', () => {
    const result = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p1' }, ctxAt(1_000));
    expect(result.state.hostId).toBe('p2');
  });

  it('reaps the seat once the hold expires', () => {
    let state = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(1_000 + SEAT_HOLD_MS + 1)).state;
    expect(state.players.find((p) => p.id === 'p2')).toBeUndefined();
  });
});

describe('PLAYER_RECONNECTED', () => {
  it('restores the seat with its score intact', () => {
    let state = lobbyOfThree();
    state = { ...state, players: state.players.map((p) => (p.id === 'p2' ? { ...p, score: 250 } : p)) };
    state = reduce(state, { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000)).state;
    state = reduce(state, { type: 'PLAYER_RECONNECTED', playerId: 'p2' }, ctxAt(5_000)).state;

    const player = state.players.find((p) => p.id === 'p2');
    expect(player?.connected).toBe(true);
    expect(player?.score).toBe(250);
    expect(player?.seatExpiresAt).toBeNull();
  });
});

describe('drawer disconnect', () => {
  it('voids the turn so nobody scores', () => {
    const ctx = ctxAt(0);
    let state = lobbyOfThree();
    state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    const guesser = state.players.find((p) => p.id !== drawerId)!.id;
    state = reduce(state, { type: 'GUESS', playerId: guesser, text: 'apple' }, ctxAt(5_000)).state;
    state = reduce(state, { type: 'PLAYER_LEFT', playerId: drawerId }, ctxAt(6_000)).state;

    expect(state.phase.name).toBe('turn-end');
    if (state.phase.name !== 'turn-end') throw new Error('expected turn-end');
    expect(state.phase.deltas).toEqual({});
  });
});

describe('KICK', () => {
  it('removes the target and revokes their voice token', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p1', targetId: 'p3', ban: false }, ctxAt(1_000));
    expect(result.state.players.find((p) => p.id === 'p3')).toBeUndefined();
    expect(result.effects).toContainEqual({ type: 'REVOKE_VOICE', playerId: 'p3' });
    expect(result.effects).toContainEqual({ type: 'DISCONNECT', playerId: 'p3' });
  });

  it('records a ban against the target IP', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p1', targetId: 'p3', ban: true }, ctxAt(1_000));
    expect(result.state.bans).toEqual([{ playerId: 'p3', ip: 'p3' }]);
  });

  it('ignores a kick from a non-host', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p2', targetId: 'p3', ban: false }, ctxAt(1_000));
    expect(result.state.players).toHaveLength(3);
  });
});

describe('SETTINGS_CHANGED', () => {
  it('accepts a host change in the lobby', () => {
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(lobbyOfThree(), { type: 'SETTINGS_CHANGED', playerId: 'p1', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(5);
  });

  it('ignores a change from a non-host', () => {
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(lobbyOfThree(), { type: 'SETTINGS_CHANGED', playerId: 'p2', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(DEFAULT_SETTINGS.rounds);
  });

  it('ignores a change once the game is running', () => {
    const state = reduce(lobbyOfThree(), { type: 'START_GAME', playerId: 'p1' }, ctxAt(0)).state;
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(state, { type: 'SETTINGS_CHANGED', playerId: 'p1', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(DEFAULT_SETTINGS.rounds);
  });
});
