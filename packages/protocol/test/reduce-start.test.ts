import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types.js';
import { createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

const ctx: ReducerCtx = {
  now: 1_000,
  random: () => 0.5,
  pickWords: ({ count }) =>
    Array.from({ length: count }, (_, i) => ({
      text: `word${i}`, difficulty: 'easy' as const, category: 'test',
    })),
};

function roomWithTwoPlayers() {
  let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
  state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ada', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
  state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bo', avatarSeed: 'b', ip: '2.2.2.2' }, ctx).state;
  return state;
}

describe('PLAYER_JOINED', () => {
  it('makes the first player the host', () => {
    const state = roomWithTwoPlayers();
    expect(state.hostId).toBe('p1');
  });

  it('starts every player at zero', () => {
    const state = roomWithTwoPlayers();
    expect(state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('rejects a join when the room is full', () => {
    let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, maxPlayers: 2 } });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p2', name: 'B', avatarSeed: 'b', ip: '2.2.2.2' }, ctx).state;
    const result = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p3', name: 'C', avatarSeed: 'c', ip: '3.3.3.3' }, ctx);
    expect(result.state.players).toHaveLength(2);
    expect(result.effects).toContainEqual({ type: 'REJECT', playerId: 'p3', reason: 'room-full' });
  });

  it('rejects a banned IP', () => {
    const state = { ...roomWithTwoPlayers(), bans: [{ playerId: 'px', ip: '9.9.9.9' }] };
    const result = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p9', name: 'X', avatarSeed: 'x', ip: '9.9.9.9' }, ctx);
    expect(result.effects).toContainEqual({ type: 'REJECT', playerId: 'p9', reason: 'banned' });
  });
});

describe('START_GAME', () => {
  it('moves to word-select', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.phase.name).toBe('word-select');
  });

  it('offers the configured number of choices to the drawer', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    const phase = result.state.phase;
    if (phase.name !== 'word-select') throw new Error('expected word-select');
    expect(phase.choices).toHaveLength(DEFAULT_SETTINGS.wordChoices);
  });

  it('ignores a start from a non-host', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p2' }, ctx);
    expect(result.state.phase.name).toBe('lobby');
  });

  it('refuses to start with fewer than two players', () => {
    let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
    const result = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.phase.name).toBe('lobby');
  });

  it('ignores a start once a game is already under way', () => {
    const state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const again = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(again.state).toBe(state);
    expect(again.effects).toEqual([]);
  });
});

/** The podium's "Play again" is a START_GAME sent from the game-end phase. */
describe('START_GAME from the podium', () => {
  function finishedGame() {
    const state = roomWithTwoPlayers();
    return {
      ...state,
      round: DEFAULT_SETTINGS.rounds,
      players: state.players.map((p, i) => ({ ...p, score: 100 * (i + 1) })),
      usedWords: ['word0', 'word1'],
      phase: { name: 'game-end' as const },
    };
  }

  it('starts a fresh game', () => {
    const result = reduce(finishedGame(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.phase.name).toBe('word-select');
    expect(result.state.round).toBe(1);
    expect(result.state.turnIndex).toBe(0);
  });

  it('resets every score', () => {
    const result = reduce(finishedGame(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('frees the words the last game used', () => {
    const result = reduce(finishedGame(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.usedWords).toEqual([]);
  });

  it('wipes the last game’s drawing off the canvas', () => {
    const result = reduce(finishedGame(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.effects).toContainEqual({ type: 'CLEAR_CANVAS' });
  });

  it('still only listens to the host', () => {
    const result = reduce(finishedGame(), { type: 'START_GAME', playerId: 'p2' }, ctx);
    expect(result.state.phase.name).toBe('game-end');
  });
});

describe('WORD_CHOSEN', () => {
  it('moves to drawing with a deadline derived from drawTimeSec', () => {
    let state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    if (state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(state.phase.word.text).toBe('word0');
    expect(state.phase.endsAt).toBe(ctx.now + DEFAULT_SETTINGS.drawTimeSec * 1000);
  });

  it('ignores a choice from a player who is not the drawer', () => {
    let state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    const other = drawerId === 'p1' ? 'p2' : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: other, choiceIndex: 0 }, ctx).state;
    expect(state.phase.name).toBe('word-select');
  });

  it('emits a canvas clear when drawing begins', () => {
    const state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    const result = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx);
    expect(result.effects).toContainEqual({ type: 'CLEAR_CANVAS' });
  });
});
