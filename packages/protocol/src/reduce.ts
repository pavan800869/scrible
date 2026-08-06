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
