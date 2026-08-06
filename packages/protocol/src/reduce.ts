import type { Effect, GameEvent } from './events.js';
import type {
  GameMode,
  Phase,
  Player,
  PlayerId,
  RoomId,
  RoomSettings,
  RoomState,
  TurnWord,
} from './types.js';
import type { Difficulty } from './score.js';
import { buildHintSchedule } from './hints.js';
import { classifyGuess } from './guess.js';
import { normalize } from './text.js';
import { drawerScore, guesserScore } from './score.js';

export interface PickWordsFn {
  (input: {
    count: number;
    exclude: readonly string[];
    customWords: readonly string[];
    customWordsOnly: boolean;
    mode: GameMode;
    random: () => number;
  }): { text: string; difficulty: Difficulty }[];
}

export interface ReducerCtx {
  now: number;
  random: () => number;
  pickWords: PickWordsFn;
}

export interface ReduceResult {
  state: RoomState;
  effects: Effect[];
}

export const WORD_SELECT_MS = 15_000;
export const TURN_END_MS = 6_000;
export const ROUND_END_MS = 6_000;

export function createRoom(input: { id: RoomId; settings: RoomSettings }): RoomState {
  return {
    id: input.id,
    hostId: null,
    settings: input.settings,
    players: [],
    turnOrder: [],
    turnIndex: 0,
    round: 0,
    phase: { name: 'lobby' },
    usedWords: [],
    bans: [],
    pausedSince: null,
  };
}

export function reduce(state: RoomState, event: GameEvent, ctx: ReducerCtx): ReduceResult {
  switch (event.type) {
    case 'PLAYER_JOINED':
      return playerJoined(state, event, ctx);
    case 'START_GAME':
      return startGame(state, event, ctx);
    case 'WORD_CHOSEN':
      return wordChosen(state, event, ctx);
    case 'GUESS':
      return guess(state, event, ctx);
    case 'TICK':
      return tick(state, ctx);
    case 'PLAYER_LEFT':
      return playerLeft(state, event, ctx);
    case 'PLAYER_RECONNECTED':
      return playerReconnected(state, event);
    case 'KICK':
      return kick(state, event, ctx);
    case 'VOTEKICK':
      return votekick(state, event, ctx);
    case 'SETTINGS_CHANGED':
      return settingsChanged(state, event);
    default:
      return { state, effects: [] };
  }
}

function playerJoined(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_JOINED' }>,
  ctx: ReducerCtx,
): ReduceResult {
  if (state.bans.some((b) => b.ip === event.ip)) {
    return { state, effects: [{ type: 'REJECT', playerId: event.playerId, reason: 'banned' }] };
  }
  if (state.players.length >= state.settings.maxPlayers) {
    return { state, effects: [{ type: 'REJECT', playerId: event.playerId, reason: 'room-full' }] };
  }

  const player: Player = {
    id: event.playerId,
    name: event.name,
    avatarSeed: event.avatarSeed,
    score: 0,
    connected: true,
    seatExpiresAt: null,
    joinedAt: ctx.now,
    ip: event.ip,
  };

  return {
    state: {
      ...state,
      hostId: state.hostId ?? player.id,
      players: [...state.players, player],
    },
    effects: [
      { type: 'BROADCAST_STATE' },
      { type: 'CHAT', scope: 'all', from: null, text: `${player.name} joined`, kind: 'system' },
    ],
  };
}

function startGame(
  state: RoomState,
  event: Extract<GameEvent, { type: 'START_GAME' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const connected = state.players.filter((p) => p.connected);
  if (state.phase.name !== 'lobby') return { state, effects: [] };
  if (event.playerId !== state.hostId) return { state, effects: [] };
  if (connected.length < 2) return { state, effects: [] };

  const reset: RoomState = {
    ...state,
    players: state.players.map((p) => ({ ...p, score: 0 })),
    round: 1,
    turnIndex: 0,
    usedWords: [],
    turnOrder: shuffle(
      connected.map((p) => p.id),
      ctx.random,
    ),
  };

  return beginWordSelect(reset, ctx);
}

/** Shared by START_GAME and every subsequent turn advance. */
export function beginWordSelect(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const drawerId = state.turnOrder[state.turnIndex];
  if (drawerId === undefined) return { state, effects: [] };

  const choices: TurnWord[] = ctx.pickWords({
    count: state.settings.wordChoices,
    exclude: state.usedWords,
    customWords: state.settings.customWords,
    customWordsOnly: state.settings.customWordsOnly,
    mode: state.settings.mode,
    random: ctx.random,
  });

  const phase: Phase = {
    name: 'word-select',
    drawerId,
    choices,
    endsAt: ctx.now + WORD_SELECT_MS,
  };

  return { state: { ...state, phase }, effects: [{ type: 'BROADCAST_STATE' }] };
}

function wordChosen(
  state: RoomState,
  event: Extract<GameEvent, { type: 'WORD_CHOSEN' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const phase = state.phase;
  if (phase.name !== 'word-select') return { state, effects: [] };
  if (event.playerId !== phase.drawerId) return { state, effects: [] };

  const word = phase.choices[event.choiceIndex] ?? phase.choices[0];
  if (word === undefined) return { state, effects: [] };

  return startDrawing(state, phase.drawerId, word, ctx);
}

/** Shared by WORD_CHOSEN and the word-select timeout auto-pick. */
export function startDrawing(
  state: RoomState,
  drawerId: PlayerId,
  word: TurnWord,
  ctx: ReducerCtx,
): ReduceResult {
  const drawTimeMs = state.settings.drawTimeSec * 1000;

  const phase: Phase = {
    name: 'drawing',
    drawerId,
    word,
    startedAt: ctx.now,
    endsAt: ctx.now + drawTimeMs,
    revealed: [],
    schedule: buildHintSchedule({
      word: word.text,
      hints: state.settings.hints,
      drawTimeMs,
      mode: state.settings.mode,
      random: ctx.random,
    }),
    correct: [],
  };

  return {
    state: { ...state, phase, usedWords: [...state.usedWords, word.text] },
    effects: [{ type: 'CLEAR_CANVAS' }, { type: 'BROADCAST_STATE' }],
  };
}

export const FIRST_GUESS_CLAMP_MS = 30_000;

function guess(
  state: RoomState,
  event: Extract<GameEvent, { type: 'GUESS' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const phase = state.phase;

  // Outside a live turn, chat is just chat.
  if (phase.name !== 'drawing') {
    return {
      state,
      effects: [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  // The drawer may chat, but never in a way that leaks the answer.
  if (event.playerId === phase.drawerId) {
    const leaks =
      classifyGuess(event.text, phase.word.text) !== 'wrong' ||
      normalize(event.text).includes(normalize(phase.word.text));
    return {
      state,
      effects: leaks
        ? [
            {
              type: 'PRIVATE',
              playerId: event.playerId,
              text: 'That gives it away — blocked.',
              kind: 'warning',
            },
          ]
        : [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  // Already correct: your chat goes to the guessed-only channel.
  if (phase.correct.some((c) => c.playerId === event.playerId)) {
    return {
      state,
      effects: [
        { type: 'CHAT', scope: 'guessed', from: event.playerId, text: event.text, kind: 'message' },
      ],
    };
  }

  const verdict = classifyGuess(event.text, phase.word.text);

  if (verdict === 'wrong') {
    return {
      state,
      effects: [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  if (verdict === 'close') {
    return {
      state,
      effects: [{ type: 'PRIVATE', playerId: event.playerId, text: event.text, kind: 'close' }],
    };
  }

  // Correct.
  const drawTimeMs = state.settings.drawTimeSec * 1000;
  const points = guesserScore({
    timeRemainingMs: phase.endsAt - ctx.now,
    drawTimeMs,
    difficulty: phase.word.difficulty,
  });

  const isFirst = phase.correct.length === 0;
  const nextPhase: Phase = {
    ...phase,
    endsAt: isFirst ? Math.min(phase.endsAt, ctx.now + FIRST_GUESS_CLAMP_MS) : phase.endsAt,
    correct: [...phase.correct, { playerId: event.playerId, atMs: ctx.now, points }],
  };

  const withScore: RoomState = {
    ...state,
    phase: nextPhase,
    players: state.players.map((p) =>
      p.id === event.playerId ? { ...p, score: p.score + points } : p,
    ),
  };

  const guesserCount = state.players.filter((p) => p.connected && p.id !== phase.drawerId).length;
  const effects: Effect[] = [
    {
      type: 'CHAT',
      scope: 'all',
      from: null,
      text: `${nameOf(state, event.playerId)} guessed it`,
      kind: 'correct',
    },
    { type: 'BROADCAST_STATE' },
  ];

  if (nextPhase.correct.length >= guesserCount) {
    const ended = endTurn(withScore, ctx);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }

  return { state: withScore, effects };
}

function nameOf(state: RoomState, playerId: PlayerId): string {
  return state.players.find((p) => p.id === playerId)?.name ?? 'someone';
}

/** Close out the current drawing turn, award the drawer, and move to turn-end. */
export function endTurn(state: RoomState, ctx: ReducerCtx, voided = false): ReduceResult {
  const phase = state.phase;
  if (phase.name !== 'drawing') return { state, effects: [] };

  const otherPlayerCount = state.players.filter(
    (p) => p.connected && p.id !== phase.drawerId,
  ).length;

  const deltas: Record<PlayerId, number> = {};
  let players = state.players;

  if (!voided) {
    for (const entry of phase.correct) deltas[entry.playerId] = entry.points;

    const award = drawerScore({
      guesserScores: phase.correct.map((c) => c.points),
      otherPlayerCount,
    });
    if (award > 0) {
      deltas[phase.drawerId] = award;
      players = players.map((p) =>
        p.id === phase.drawerId ? { ...p, score: p.score + award } : p,
      );
    }
  }

  return {
    state: {
      ...state,
      players,
      phase: { name: 'turn-end', word: phase.word.text, deltas, endsAt: ctx.now + TURN_END_MS },
    },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

export const SEAT_HOLD_MS = 60_000;
export const PAUSE_ABANDON_MS = 120_000;

/** Phases where a lone player is a problem rather than a normal state. */
function isLive(phase: RoomState['phase']): boolean {
  return phase.name !== 'lobby' && phase.name !== 'game-end';
}

function applyPause(state: RoomState, ctx: ReducerCtx): ReduceResult | null {
  const connected = state.players.filter((p) => p.connected).length;

  if (connected >= 2 || !isLive(state.phase)) {
    if (state.pausedSince === null) return null;
    return { state: { ...state, pausedSince: null }, effects: [{ type: 'BROADCAST_STATE' }] };
  }

  // Newly paused.
  if (state.pausedSince === null) {
    return { state: { ...state, pausedSince: ctx.now }, effects: [{ type: 'BROADCAST_STATE' }] };
  }

  // Paused too long — abandon the game rather than hold the room open.
  if (ctx.now - state.pausedSince >= PAUSE_ABANDON_MS) {
    return {
      state: { ...state, pausedSince: null, phase: { name: 'game-end' } },
      effects: [{ type: 'BROADCAST_STATE' }],
    };
  }

  // Still paused: push every deadline forward so no clock drains while waiting.
  const shift = ctx.now - state.pausedSince;
  const phase = state.phase;
  const shifted: Phase =
    phase.name === 'drawing'
      ? { ...phase, endsAt: phase.endsAt + shift, startedAt: phase.startedAt + shift }
      : 'endsAt' in phase
        ? { ...phase, endsAt: phase.endsAt + shift }
        : phase;

  return { state: { ...state, pausedSince: ctx.now, phase: shifted }, effects: [] };
}

function tick(input: RoomState, ctx: ReducerCtx): ReduceResult {
  const reaped: Effect[] = [];
  let state = input;

  const expired = state.players.filter(
    (p) => !p.connected && p.seatExpiresAt !== null && ctx.now >= p.seatExpiresAt,
  );

  if (expired.length > 0) {
    const ids = new Set(expired.map((p) => p.id));
    state = {
      ...state,
      players: state.players.filter((p) => !ids.has(p.id)),
      turnOrder: state.turnOrder.filter((id) => !ids.has(id)),
    };
    reaped.push({ type: 'BROADCAST_STATE' });
  }

  const paused = applyPause(state, ctx);
  if (paused !== null) {
    state = paused.state;
    reaped.push(...paused.effects);
    // A paused game must not advance phases.
    if (state.pausedSince !== null) return { state, effects: reaped };
  }

  const result = tickPhase(state, ctx);
  return { state: result.state, effects: [...reaped, ...result.effects] };
}

function playerLeft(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_LEFT' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const leaving = state.players.find((p) => p.id === event.playerId);
  if (leaving === undefined) return { state, effects: [] };

  let next: RoomState = {
    ...state,
    players: state.players.map((p) =>
      p.id === event.playerId
        ? { ...p, connected: false, seatExpiresAt: ctx.now + SEAT_HOLD_MS }
        : p,
    ),
  };

  if (state.hostId === event.playerId) {
    const successor = next.players
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    next = { ...next, hostId: successor?.id ?? null };
  }

  const effects: Effect[] = [
    { type: 'BROADCAST_STATE' },
    { type: 'CHAT', scope: 'all', from: null, text: `${leaving.name} left`, kind: 'system' },
  ];

  // The drawer leaving voids the turn — nobody scores, including prior guessers.
  if (next.phase.name === 'drawing' && next.phase.drawerId === event.playerId) {
    const ended = endTurn(next, ctx, true);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }

  return { state: next, effects };
}

function playerReconnected(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_RECONNECTED' }>,
): ReduceResult {
  const seat = state.players.find((p) => p.id === event.playerId);
  if (seat === undefined) return { state, effects: [] };

  return {
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === event.playerId ? { ...p, connected: true, seatExpiresAt: null } : p,
      ),
    },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

function kick(
  state: RoomState,
  event: Extract<GameEvent, { type: 'KICK' }>,
  ctx: ReducerCtx,
): ReduceResult {
  if (event.playerId !== state.hostId) return { state, effects: [] };
  return removePlayer(state, event.targetId, event.ban, ctx);
}

function votekick(
  state: RoomState,
  event: Extract<GameEvent, { type: 'VOTEKICK' }>,
  ctx: ReducerCtx,
): ReduceResult {
  // Simple majority of connected players excluding the target.
  const eligible = state.players.filter((p) => p.connected && p.id !== event.targetId).length;
  if (eligible < 2) return { state, effects: [] };
  return removePlayer(state, event.targetId, false, ctx);
}

function removePlayer(
  state: RoomState,
  targetId: PlayerId,
  ban: boolean,
  ctx: ReducerCtx,
): ReduceResult {
  const target = state.players.find((p) => p.id === targetId);
  if (target === undefined) return { state, effects: [] };

  let next: RoomState = {
    ...state,
    players: state.players.filter((p) => p.id !== targetId),
    turnOrder: state.turnOrder.filter((id) => id !== targetId),
    bans: ban ? [...state.bans, { playerId: targetId, ip: target.ip }] : state.bans,
  };

  if (next.hostId === targetId) {
    const successor = next.players
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    next = { ...next, hostId: successor?.id ?? null };
  }

  const effects: Effect[] = [
    { type: 'REVOKE_VOICE', playerId: targetId },
    { type: 'DISCONNECT', playerId: targetId },
    { type: 'CHAT', scope: 'all', from: null, text: `${target.name} was removed`, kind: 'system' },
    { type: 'BROADCAST_STATE' },
  ];

  if (next.phase.name === 'drawing' && next.phase.drawerId === targetId) {
    const ended = endTurn(next, ctx, true);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }
  return { state: next, effects };
}

function settingsChanged(
  state: RoomState,
  event: Extract<GameEvent, { type: 'SETTINGS_CHANGED' }>,
): ReduceResult {
  if (event.playerId !== state.hostId) return { state, effects: [] };
  if (state.phase.name !== 'lobby') return { state, effects: [] };
  return { state: { ...state, settings: event.settings }, effects: [{ type: 'BROADCAST_STATE' }] };
}

function tickPhase(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const phase = state.phase;

  switch (phase.name) {
    case 'word-select': {
      if (ctx.now < phase.endsAt) return { state, effects: [] };
      const word = phase.choices[0];
      if (word === undefined) return { state, effects: [] };
      return startDrawing(state, phase.drawerId, word, ctx);
    }

    case 'drawing': {
      if (ctx.now >= phase.endsAt) return endTurn(state, ctx);

      const elapsed = ctx.now - phase.startedAt;
      const due = phase.schedule
        .filter((r) => r.atElapsedMs <= elapsed && !phase.revealed.includes(r.index))
        .map((r) => r.index);

      if (due.length === 0) return { state, effects: [] };

      return {
        state: { ...state, phase: { ...phase, revealed: [...phase.revealed, ...due] } },
        effects: [{ type: 'BROADCAST_STATE' }],
      };
    }

    case 'turn-end':
      return ctx.now >= phase.endsAt ? advanceTurn(state, ctx) : { state, effects: [] };

    case 'round-end':
      return ctx.now >= phase.endsAt ? advanceRound(state, ctx) : { state, effects: [] };

    default:
      return { state, effects: [] };
  }
}

function advanceTurn(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const nextIndex = state.turnIndex + 1;

  if (nextIndex < state.turnOrder.length) {
    return beginWordSelect({ ...state, turnIndex: nextIndex }, ctx);
  }
  return {
    state: { ...state, phase: { name: 'round-end', endsAt: ctx.now + ROUND_END_MS } },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

function advanceRound(state: RoomState, ctx: ReducerCtx): ReduceResult {
  if (state.round >= state.settings.rounds) {
    return {
      state: { ...state, phase: { name: 'game-end' } },
      effects: [{ type: 'BROADCAST_STATE' }],
    };
  }

  const connected = state.players.filter((p) => p.connected).map((p) => p.id);
  return beginWordSelect(
    {
      ...state,
      round: state.round + 1,
      turnIndex: 0,
      turnOrder: shuffle(connected, ctx.random),
    },
    ctx,
  );
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
