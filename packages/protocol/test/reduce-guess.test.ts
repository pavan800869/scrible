import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { FIRST_GUESS_CLAMP_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

/** A room already in the drawing phase, drawer p1, word "apple", 80s clock from t=0. */
function drawingRoom(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 0 } });
  for (const [id, name] of [['p1', 'Ada'], ['p2', 'Bo'], ['p3', 'Cy']] as const) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name, avatarSeed: id, ip: id }, ctx).state;
  }
  state = { ...state, turnOrder: ['p1', 'p2', 'p3'], turnIndex: 0, round: 1 };
  state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
  state = { ...state, turnOrder: ['p1', 'p2', 'p3'], turnIndex: 0 };
  if (state.phase.name === 'word-select') {
    state = { ...state, phase: { ...state.phase, drawerId: 'p1' } };
  }
  return reduce(state, { type: 'WORD_CHOSEN', playerId: 'p1', choiceIndex: 0 }, ctx).state;
}

describe('GUESS', () => {
  it('scores a correct guess and records the player', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000));
    const player = result.state.players.find((p) => p.id === 'p2');
    expect(player?.score).toBeGreaterThan(0);
    if (result.state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(result.state.phase.correct.map((c) => c.playerId)).toEqual(['p2']);
  });

  it('does not broadcast the guess text when it is correct', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000));
    const chat = result.effects.filter((e) => e.type === 'CHAT');
    expect(JSON.stringify(chat)).not.toContain('apple');
  });

  it('sends a private notice for a close guess and broadcasts nothing', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'aple' }, ctxAt(10_000));
    expect(result.effects).toContainEqual({ type: 'PRIVATE', playerId: 'p2', text: 'aple', kind: 'close' });
    expect(result.effects.some((e) => e.type === 'CHAT' && e.scope === 'all')).toBe(false);
  });

  it('broadcasts a wrong guess to the room', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'banana' }, ctxAt(10_000));
    expect(result.effects).toContainEqual({
      type: 'CHAT', scope: 'all', from: 'p2', text: 'banana', kind: 'message',
    });
  });

  it('ignores a guess from the drawer and warns them if it contains the word', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p1', text: 'apple' }, ctxAt(10_000));
    expect(result.effects.some((e) => e.type === 'PRIVATE' && e.kind === 'warning')).toBe(true);
    expect(result.effects.some((e) => e.type === 'CHAT' && e.scope === 'all')).toBe(false);
  });

  it('routes chat from a player who already guessed to the guessed-only channel', () => {
    const state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    const result = reduce(state, { type: 'GUESS', playerId: 'p2', text: 'nice one' }, ctxAt(11_000));
    expect(result.effects).toContainEqual({
      type: 'CHAT', scope: 'guessed', from: 'p2', text: 'nice one', kind: 'message',
    });
  });

  it('awards fewer points to a later guesser', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(20_000)).state;
    const p2 = state.players.find((p) => p.id === 'p2')!.score;
    const p3 = state.players.find((p) => p.id === 'p3')!.score;
    expect(p3).toBeLessThan(p2);
  });

  it('clamps the clock after the first correct guess', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(1_000));
    if (result.state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(result.state.phase.endsAt).toBe(1_000 + FIRST_GUESS_CLAMP_MS);
  });

  it('ends the turn once every guesser is correct', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(12_000)).state;
    expect(state.phase.name).toBe('turn-end');
  });

  it('awards the drawer when the turn ends', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(12_000)).state;
    expect(state.players.find((p) => p.id === 'p1')!.score).toBeGreaterThan(0);
  });
});

describe('TICK', () => {
  it('reveals a scheduled hint once its time arrives', () => {
    const ctx = ctxAt(0);
    let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 2 } });
    for (const id of ['p1', 'p2']) {
      state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
    }
    state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    state = reduce(state, { type: 'TICK' }, ctxAt(70_000)).state;
    if (state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(state.phase.revealed.length).toBeGreaterThan(0);
  });

  it('ends the turn when the clock expires with nobody correct', () => {
    const state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    expect(state.phase.name).toBe('turn-end');
  });

  it('awards nobody when nobody guessed', () => {
    const state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    expect(state.players.every((p) => p.score === 0)).toBe(true);
  });

  it('advances to the next drawer after turn-end elapses', () => {
    let state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(90_000)).state;
    expect(state.phase.name).toBe('word-select');
    expect(state.turnIndex).toBe(1);
  });
});
