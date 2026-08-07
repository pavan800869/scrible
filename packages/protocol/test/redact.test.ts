import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { redactStateFor } from '../src/redact.js';

function drawingState(): RoomState {
  return {
    id: 'room1',
    hostId: 'p1',
    settings: DEFAULT_SETTINGS,
    players: [
      { id: 'p1', name: 'Ada', avatarSeed: 'a', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '1.1.1.1' },
      { id: 'p2', name: 'Bo', avatarSeed: 'b', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '2.2.2.2' },
      { id: 'p3', name: 'Cy', avatarSeed: 'c', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '3.3.3.3' },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    turnIndex: 0,
    round: 1,
    phase: {
      name: 'drawing',
      drawerId: 'p1',
      word: { text: 'apple', difficulty: 'easy' },
      startedAt: 0,
      endsAt: 80_000,
      revealed: [0],
      schedule: [],
      correct: [{ playerId: 'p2', atMs: 10_000, points: 300 }],
      reactions: [
        { playerId: 'p2', kind: 'like' },
        { playerId: 'p3', kind: 'dislike' },
      ],
    },
    usedWords: [],
    bans: [],
    pausedSince: null,
  };
}

describe('redactStateFor', () => {
  it('never includes the raw word anywhere in a guesser view', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(JSON.stringify(view)).not.toContain('apple');
  });

  it('gives the drawer the full word', () => {
    const view = redactStateFor(drawingState(), 'p1');
    expect(view.phase.word).toBe('apple');
  });

  it('gives a correct guesser the full word', () => {
    const view = redactStateFor(drawingState(), 'p2');
    expect(view.phase.word).toBe('apple');
  });

  it('gives a guesser a mask with only revealed letters', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(view.phase.mask).toEqual([
      { kind: 'letter', char: 'a' },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
    ]);
  });

  it('reports who has guessed without leaking their guesses', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(view.phase.correctPlayerIds).toEqual(['p2']);
  });

  it('hides word choices from everyone but the drawer', () => {
    const state = drawingState();
    state.phase = {
      name: 'word-select', drawerId: 'p1', endsAt: 15_000,
      choices: [{ text: 'apple', difficulty: 'easy' }],
    };
    expect(JSON.stringify(redactStateFor(state, 'p2'))).not.toContain('apple');
    expect(redactStateFor(state, 'p1').phase.choices).toHaveLength(1);
  });

  it('reveals the word to everyone at turn-end', () => {
    const state = drawingState();
    state.phase = { name: 'turn-end', word: 'apple', deltas: { p2: 300 }, endsAt: 6_000 };
    expect(redactStateFor(state, 'p3').phase.word).toBe('apple');
  });

  it('omits ban records from every client view', () => {
    const state = drawingState();
    state.bans = [{ playerId: 'p9', ip: '10.0.0.1' }];
    expect(JSON.stringify(redactStateFor(state, 'p1'))).not.toContain('10.0.0.1');
  });

  it('never exposes a player IP', () => {
    expect(JSON.stringify(redactStateFor(drawingState(), 'p1'))).not.toContain('2.2.2.2');
  });
});
