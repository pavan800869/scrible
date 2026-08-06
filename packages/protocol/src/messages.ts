import { z } from 'zod';
import { roomSettingsSchema } from './types.js';
import type { ClientRoomView } from './redact.js';

export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    roomId: z.string().min(4).max(16),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    avatarSeed: z.string().min(1).max(64),
    rejoinToken: z.string().max(512).optional(),
  }),
  z.object({ type: z.literal('settings'), settings: roomSettingsSchema }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('choose-word'), index: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal('chat'), text: z.string().min(1).max(MAX_CHAT_LENGTH) }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('clear') }),
  z.object({ type: z.literal('kick'), targetId: z.string(), ban: z.boolean() }),
  z.object({ type: z.literal('votekick'), targetId: z.string() }),
  z.object({ type: z.literal('pong') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'welcome'; playerId: string; rejoinToken: string; view: ClientRoomView }
  | { type: 'state'; view: ClientRoomView }
  | {
      type: 'chat';
      from: string | null;
      text: string;
      kind: 'message' | 'system' | 'correct';
      scope: 'all' | 'guessed';
    }
  | { type: 'private'; text: string; kind: 'close' | 'warning' }
  | { type: 'clear' }
  | { type: 'undo'; strokeCount: number }
  | { type: 'error'; reason: string }
  | { type: 'ping' };

/** First byte of every binary frame, so stroke data is unambiguous. */
export const STROKE_BINARY_HEADER = 0x01;
