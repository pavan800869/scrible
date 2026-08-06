import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  STROKE_BINARY_HEADER,
  clientMessageSchema,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from '@scrible/protocol';
import { TokenBucket } from './ratelimit.js';

export interface Connection {
  /** Mutable: a successful rejoin reclaims the original seat's id. */
  playerId: PlayerId;
  roomId: string | null;
  socket: WebSocket;
  ip: string;
  alive: boolean;
}

export function createConnection(socket: WebSocket, ip: string): Connection {
  return { playerId: randomUUID(), roomId: null, socket, ip, alive: true };
}

export function send(connection: Connection, message: ServerMessage): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return;
  connection.socket.send(JSON.stringify(message));
}

export function sendBinary(connection: Connection, frame: Uint8Array): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return;
  connection.socket.send(frame, { binary: true });
}

export interface Limits {
  control: TokenBucket;
  chat: TokenBucket;
  strokes: TokenBucket;
}

export function createLimits(): Limits {
  return {
    control: new TokenBucket(20, 20),
    chat: new TokenBucket(4, 2),
    strokes: new TokenBucket(25, 25),
  };
}

/** Returns the parsed message, or null when it is malformed. Never throws. */
export function parseControl(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function isStrokeFrame(frame: Uint8Array): boolean {
  return frame.length > 1 && frame[0] === STROKE_BINARY_HEADER;
}
