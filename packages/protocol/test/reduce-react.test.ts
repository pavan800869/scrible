import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types.js';
import { createRoom, endTurn, reduce, type ReducerCtx } from '../src/reduce.js';
import { redactStateFor } from '../src/redact.js';
import { REACTION_MAX, REACTION_MIN, REACTION_POINTS, reactionBonus } from '../src/score.js';

const ctx: ReducerCtx = {
  now: 1_000,
  random: () => 0.5,
  pickWords: ({ count }) =>
    Array.from({ length: count }, (_, i) => ({ text: `word${i}`, difficulty: 'easy' as const })),
};

/** p1 draws, p2 and p3 watch. */
function drawingRoom() {
  let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
  for (const [id, name] of [
    ['p1', 'Ada'],
    ['p2', 'Bo'],
    ['p3', 'Cy'],
  ] as const) {
    state = reduce(
      state,
      { type: 'PLAYER_JOINED', playerId: id, name, avatarSeed: id, ip: `${id}.1` },
      ctx,
    ).state;
  }
  state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
  // The turn order is shuffled; force p1 to be the drawer so the test is stable.
  state = { ...state, turnOrder: ['p1', 'p2', 'p3'], turnIndex: 0 };
  state = { ...state, phase: { ...state.phase, drawerId: 'p1' } as typeof state.phase };
  return reduce(state, { type: 'WORD_CHOSEN', playerId: 'p1', choiceIndex: 0 }, ctx).state;
}

function reactionsOf(state: ReturnType<typeof drawingRoom>) {
  return state.phase.name === 'drawing' ? state.phase.reactions : [];
}

describe('reactionBonus', () => {
  it('is nothing when the room is silent', () => {
    expect(reactionBonus({ likes: 0, dislikes: 0 })).toBe(0);
  });

  it('pays out the net vote', () => {
    expect(reactionBonus({ likes: 3, dislikes: 1 })).toBe(2 * REACTION_POINTS);
  });

  it('goes negative when the room hated it', () => {
    expect(reactionBonus({ likes: 0, dislikes: 2 })).toBe(-2 * REACTION_POINTS);
  });

  it('clamps a landslide of likes', () => {
    expect(reactionBonus({ likes: 40, dislikes: 0 })).toBe(REACTION_MAX);
  });

  it('clamps a pile-on of dislikes', () => {
    expect(reactionBonus({ likes: 0, dislikes: 40 })).toBe(REACTION_MIN);
  });
});

describe('REACT', () => {
  it('records a like from a guesser', () => {
    const state = reduce(drawingRoom(), { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    expect(reactionsOf(state)).toEqual([{ playerId: 'p2', kind: 'like' }]);
  });

  it('replaces a vote rather than stacking it', () => {
    let state = reduce(drawingRoom(), { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    state = reduce(state, { type: 'REACT', playerId: 'p2', kind: 'dislike' }, ctx).state;
    expect(reactionsOf(state)).toEqual([{ playerId: 'p2', kind: 'dislike' }]);
  });

  it('toggles off when the same vote is sent twice', () => {
    let state = reduce(drawingRoom(), { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    state = reduce(state, { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    expect(reactionsOf(state)).toEqual([]);
  });

  it('withdraws on an explicit null', () => {
    let state = reduce(drawingRoom(), { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    state = reduce(state, { type: 'REACT', playerId: 'p2', kind: null }, ctx).state;
    expect(reactionsOf(state)).toEqual([]);
  });

  it('ignores the drawer voting on their own drawing', () => {
    const state = reduce(drawingRoom(), { type: 'REACT', playerId: 'p1', kind: 'like' }, ctx).state;
    expect(reactionsOf(state)).toEqual([]);
  });

  it('ignores a vote from someone not in the room', () => {
    const state = reduce(drawingRoom(), { type: 'REACT', playerId: 'ghost', kind: 'like' }, ctx)
      .state;
    expect(reactionsOf(state)).toEqual([]);
  });

  it('ignores votes outside a live turn', () => {
    const lobby = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
    const result = reduce(lobby, { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx);
    expect(result.effects).toEqual([]);
    expect(result.state).toBe(lobby);
  });
});

describe('reactions and the drawer score', () => {
  it('adds applause on top of the base award', () => {
    let state = drawingRoom();
    state = reduce(state, { type: 'GUESS', playerId: 'p2', text: 'word0' }, ctx).state;
    const withoutVotes = endTurn(state, ctx).state.players.find((p) => p.id === 'p1')?.score ?? 0;

    let liked = reduce(state, { type: 'REACT', playerId: 'p3', kind: 'like' }, ctx).state;
    liked = endTurn(liked, ctx).state;

    expect(liked.players.find((p) => p.id === 'p1')?.score).toBe(withoutVotes + REACTION_POINTS);
  });

  it('caps how far a pile-on can drag the drawer down', () => {
    let state = drawingRoom();
    state = reduce(state, { type: 'GUESS', playerId: 'p2', text: 'word0' }, ctx).state;
    const base = endTurn(state, ctx).state.players.find((p) => p.id === 'p1')?.score ?? 0;

    // Far more dislikes than the clamp allows to count.
    if (state.phase.name === 'drawing') {
      state = {
        ...state,
        phase: {
          ...state.phase,
          reactions: Array.from({ length: 20 }, (_, i) => ({
            playerId: `x${i}`,
            kind: 'dislike' as const,
          })),
        },
      };
    }

    const score = endTurn(state, ctx).state.players.find((p) => p.id === 'p1')?.score ?? 0;
    expect(score).toBe(base + REACTION_MIN);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('pays nothing when nobody guessed, however loud the applause', () => {
    let state = drawingRoom();
    state = reduce(state, { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    state = reduce(state, { type: 'REACT', playerId: 'p3', kind: 'like' }, ctx).state;

    const ended = endTurn(state, ctx).state;
    expect(ended.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });
});

describe('reaction redaction', () => {
  it('shows tallies and the viewer’s own vote, never who voted', () => {
    let state = drawingRoom();
    state = reduce(state, { type: 'REACT', playerId: 'p2', kind: 'like' }, ctx).state;
    state = reduce(state, { type: 'REACT', playerId: 'p3', kind: 'dislike' }, ctx).state;

    const view = redactStateFor(state, 'p3');
    expect(view.phase.likes).toBe(1);
    expect(view.phase.dislikes).toBe(1);
    expect(view.phase.myReaction).toBe('dislike');
    expect(JSON.stringify(view)).not.toContain('"playerId":"p2"');
  });

  it('reports no vote for someone who has not voted', () => {
    const view = redactStateFor(drawingRoom(), 'p2');
    expect(view.phase.myReaction).toBeNull();
    expect(view.phase.likes).toBe(0);
  });
});
