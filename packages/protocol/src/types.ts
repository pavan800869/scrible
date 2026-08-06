import { z } from 'zod';
import type { Difficulty } from './score.js';
import type { GameModeName, MaskCell } from './hints.js';

export type PlayerId = string;
export type RoomId = string;

export interface Player {
  id: PlayerId;
  name: string;
  avatarSeed: string;
  score: number;
  connected: boolean;
  /** Wall-clock ms at which a disconnected player's seat expires. */
  seatExpiresAt: number | null;
  joinedAt: number;
  /** Server-side only. Stripped by redactStateFor — never sent to a client. */
  ip: string;
}

export const DRAW_TIME_STEPS = [
  15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240,
] as const;

/** customWordsOnly needs enough words to fill several turns without repeats. */
export const MIN_CUSTOM_WORDS = 5;

export const roomSettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(20),
    rounds: z.number().int().min(2).max(10),
    drawTimeSec: z.number().int().refine((n) => (DRAW_TIME_STEPS as readonly number[]).includes(n), {
      message: 'drawTimeSec must be one of the allowed steps',
    }),
    wordChoices: z.number().int().min(1).max(5),
    hints: z.number().int().min(0).max(5),
    mode: z.enum(['normal', 'hidden', 'combination']),
    customWords: z.array(z.string().min(1).max(40)).max(500),
    customWordsOnly: z.boolean(),
  })
  .refine((s) => !s.customWordsOnly || s.customWords.length >= MIN_CUSTOM_WORDS, {
    message: `customWordsOnly requires at least ${MIN_CUSTOM_WORDS} custom words`,
    path: ['customWords'],
  });

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 12,
  rounds: 3,
  drawTimeSec: 80,
  wordChoices: 3,
  hints: 2,
  mode: 'normal',
  customWords: [],
  customWordsOnly: false,
};

export interface TurnWord {
  text: string;
  difficulty: Difficulty;
}

export type Phase =
  | { name: 'lobby' }
  | { name: 'word-select'; drawerId: PlayerId; choices: TurnWord[]; endsAt: number }
  | {
      name: 'drawing';
      drawerId: PlayerId;
      word: TurnWord;
      startedAt: number;
      endsAt: number;
      revealed: number[];
      schedule: { atElapsedMs: number; index: number }[];
      correct: { playerId: PlayerId; atMs: number; points: number }[];
    }
  | { name: 'turn-end'; word: string; deltas: Record<PlayerId, number>; endsAt: number }
  | { name: 'round-end'; endsAt: number }
  | { name: 'game-end' };

export interface RoomState {
  id: RoomId;
  hostId: PlayerId | null;
  settings: RoomSettings;
  players: Player[];
  /** Player IDs in this round's drawing order. */
  turnOrder: PlayerId[];
  turnIndex: number;
  round: number;
  phase: Phase;
  usedWords: string[];
  bans: { playerId: PlayerId; ip: string }[];
  /** Set while fewer than two players are connected mid-game. */
  pausedSince: number | null;
}

/** The redacted view a client receives. Never contains the secret word. */
export interface ClientPhaseView {
  name: Phase['name'];
  drawerId?: PlayerId;
  endsAt?: number;
  /** Present only for the drawer during word-select. */
  choices?: TurnWord[];
  /** Present during drawing; the drawer and correct guessers see real letters. */
  mask?: MaskCell[];
  /** Present at turn-end, when the word is public. */
  word?: string;
  deltas?: Record<PlayerId, number>;
  correctPlayerIds?: PlayerId[];
}

export type GameMode = GameModeName;
