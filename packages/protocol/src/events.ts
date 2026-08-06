import type { PlayerId, RoomSettings } from './types.js';

export type GameEvent =
  | { type: 'PLAYER_JOINED'; playerId: PlayerId; name: string; avatarSeed: string; ip: string }
  | { type: 'PLAYER_LEFT'; playerId: PlayerId }
  | { type: 'PLAYER_RECONNECTED'; playerId: PlayerId }
  | { type: 'SETTINGS_CHANGED'; playerId: PlayerId; settings: RoomSettings }
  | { type: 'START_GAME'; playerId: PlayerId }
  | { type: 'WORD_CHOSEN'; playerId: PlayerId; choiceIndex: number }
  | { type: 'GUESS'; playerId: PlayerId; text: string }
  | { type: 'KICK'; playerId: PlayerId; targetId: PlayerId; ban: boolean }
  | { type: 'VOTEKICK'; playerId: PlayerId; targetId: PlayerId }
  | { type: 'TICK' };

export type Effect =
  | { type: 'BROADCAST_STATE' }
  | { type: 'REJECT'; playerId: PlayerId; reason: 'room-full' | 'banned' | 'name-taken' }
  | {
      type: 'CHAT';
      scope: 'all' | 'guessed';
      from: PlayerId | null;
      text: string;
      kind: 'message' | 'system' | 'correct';
    }
  | { type: 'PRIVATE'; playerId: PlayerId; text: string; kind: 'close' | 'warning' }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'REVOKE_VOICE'; playerId: PlayerId }
  | { type: 'DISCONNECT'; playerId: PlayerId };
