import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import {
  redactStateFor,
  type ClientMessage,
  type GameEvent,
  type PlayerId,
} from '@scrible/protocol';
import { buildApp } from './http.js';
import { MemoryRoomStore } from './rooms/store.js';
import { RoomRuntime, type Transport } from './rooms/room.js';
import {
  createConnection,
  createLimits,
  isStrokeFrame,
  parseControl,
  send,
  sendBinary,
  type Connection,
  type Limits,
} from './net/connection.js';
import { mintRejoinToken, verifyRejoinToken } from './net/rejoin.js';
import { createVoiceService, type VoiceService } from './voice/tokens.js';

const TICK_MS = 250;
const EMPTY_ROOM_GRACE_MS = 120_000;

export class GameServer {
  #store = new MemoryRoomStore();
  #runtimes = new Map<string, RoomRuntime>();
  #connections = new Map<PlayerId, { connection: Connection; limits: Limits }>();
  #emptySince = new Map<string, number>();
  #wss = new WebSocketServer({ noServer: true });
  #app: FastifyInstance | null = null;
  #timer: NodeJS.Timeout | null = null;
  /**
   * Per-process fallback is correct: tokens should not outlive a restart,
   * because the in-memory rooms they point at do not either.
   */
  readonly #secret = process.env['REJOIN_SECRET'] ?? randomUUID();
  readonly #voice: VoiceService;

  constructor(
    private readonly port: number,
    voice: VoiceService = createVoiceService(),
  ) {
    this.#voice = voice;
  }

  async start(): Promise<string> {
    const app = buildApp({ store: this.#store, secret: this.#secret, voice: this.#voice });
    this.#app = app;

    // Fastify owns the HTTP server; we only borrow its upgrade event for ws.
    // Bind all interfaces: inside a container, 127.0.0.1 is unreachable from
    // the host and the deploy would come up dead.
    await app.listen({ port: this.port, host: process.env['HOST'] ?? '0.0.0.0' });

    app.server.on('upgrade', (req, socket, head) => {
      this.#wss.handleUpgrade(req, socket, head, (ws) => {
        this.#onSocket(ws, req.socket.remoteAddress ?? 'unknown');
      });
    });

    this.#timer = setInterval(() => this.#tick(), TICK_MS);

    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : this.port;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (this.#timer !== null) clearInterval(this.#timer);
    for (const { connection } of this.#connections.values()) connection.socket.terminate();
    this.#wss.close();
    await this.#app?.close();
  }

  #transport(): Transport {
    return {
      send: (playerId, message) => {
        const entry = this.#connections.get(playerId);
        if (entry !== undefined) send(entry.connection, message);
      },
      sendBinary: (playerId, frame) => {
        const entry = this.#connections.get(playerId);
        if (entry !== undefined) sendBinary(entry.connection, frame);
      },
      close: (playerId) => {
        const entry = this.#connections.get(playerId);
        entry?.connection.socket.close();
      },
    };
  }

  #runtimeFor(roomId: string): RoomRuntime | undefined {
    if (this.#store.get(roomId) === undefined) return undefined;
    let runtime = this.#runtimes.get(roomId);
    if (runtime === undefined) {
      runtime = new RoomRuntime(roomId, this.#store, this.#transport(), this.#voice);
      this.#runtimes.set(roomId, runtime);
    }
    return runtime;
  }

  #onSocket(ws: WebSocket, ip: string): void {
    const connection = createConnection(ws, ip);
    const limits = createLimits();
    this.#connections.set(connection.playerId, { connection, limits });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.#onBinary(connection, limits, new Uint8Array(data as Buffer));
        return;
      }
      this.#onControl(connection, limits, String(data));
    });

    ws.on('close', () => {
      this.#connections.delete(connection.playerId);
      if (connection.roomId !== null) {
        this.#runtimeFor(connection.roomId)?.dispatch(
          { type: 'PLAYER_LEFT', playerId: connection.playerId },
          Date.now(),
        );
      }
    });
  }

  #onControl(connection: Connection, limits: Limits, raw: string): void {
    if (!limits.control.tryConsume(Date.now())) return;

    const message = parseControl(raw);
    if (message === null) {
      send(connection, { type: 'error', reason: 'malformed' });
      return;
    }

    if (message.type === 'join') {
      this.#onJoin(connection, message);
      return;
    }

    if (connection.roomId === null) return;
    const runtime = this.#runtimeFor(connection.roomId);
    if (runtime === undefined) return;

    if (message.type === 'undo' || message.type === 'clear') {
      this.#onCanvasCommand(connection, runtime, message.type);
      return;
    }

    const event = toEvent(message, connection.playerId);
    if (event === null) return;
    if (message.type === 'chat' && !limits.chat.tryConsume(Date.now())) return;

    runtime.dispatch(event, Date.now());
  }

  #onJoin(connection: Connection, message: Extract<ClientMessage, { type: 'join' }>): void {
    const runtime = this.#runtimeFor(message.roomId);
    if (runtime === undefined) {
      send(connection, { type: 'error', reason: 'no-such-room' });
      connection.socket.close();
      return;
    }

    const claim =
      message.rejoinToken !== undefined
        ? verifyRejoinToken(this.#secret, message.rejoinToken)
        : null;

    const seat =
      claim !== null && claim.roomId === message.roomId
        ? this.#store.get(message.roomId)?.players.find((p) => p.id === claim.playerId)
        : undefined;

    if (claim !== null && seat !== undefined && !seat.connected) {
      // Reclaim the existing seat, score and all.
      this.#connections.delete(connection.playerId);
      const limits = createLimits();
      connection.playerId = claim.playerId;
      connection.roomId = message.roomId;
      this.#connections.set(connection.playerId, { connection, limits });
      runtime.dispatch({ type: 'PLAYER_RECONNECTED', playerId: connection.playerId }, Date.now());
      this.#sendWelcome(connection, message.roomId);
      for (const frame of runtime.strokes.log()) sendBinary(connection, frame);
      return;
    }

    connection.roomId = message.roomId;
    runtime.dispatch(
      {
        type: 'PLAYER_JOINED',
        playerId: connection.playerId,
        name: message.name,
        avatarSeed: message.avatarSeed,
        ip: connection.ip,
      },
      Date.now(),
    );

    this.#sendWelcome(connection, message.roomId);

    // Replay the in-progress canvas so a late joiner sees the drawing.
    for (const frame of runtime.strokes.log()) sendBinary(connection, frame);
  }

  #sendWelcome(connection: Connection, roomId: string): void {
    const state = this.#store.get(roomId);
    if (state === undefined) return;
    if (!state.players.some((p) => p.id === connection.playerId)) return;

    send(connection, {
      type: 'welcome',
      playerId: connection.playerId,
      rejoinToken: mintRejoinToken(this.#secret, roomId, connection.playerId),
      view: redactStateFor(state, connection.playerId),
    });
  }

  /** Undo and clear touch the stroke log, not the reducer. Drawer only. */
  #onCanvasCommand(connection: Connection, runtime: RoomRuntime, kind: 'undo' | 'clear'): void {
    const state = this.#store.get(runtime.id);
    if (state === undefined || state.phase.name !== 'drawing') return;
    if (state.phase.drawerId !== connection.playerId) return;

    if (kind === 'clear') {
      runtime.strokes.clear();
      for (const player of state.players) {
        const entry = this.#connections.get(player.id);
        if (entry !== undefined) send(entry.connection, { type: 'clear' });
      }
      return;
    }

    const strokeCount = runtime.strokes.undo();
    for (const player of state.players) {
      const entry = this.#connections.get(player.id);
      if (entry !== undefined) send(entry.connection, { type: 'undo', strokeCount });
    }
  }

  #onBinary(connection: Connection, limits: Limits, frame: Uint8Array): void {
    if (connection.roomId === null) return;
    if (!isStrokeFrame(frame)) return;
    if (!limits.strokes.tryConsume(Date.now())) return;

    const state = this.#store.get(connection.roomId);
    if (state === undefined) return;
    if (state.phase.name !== 'drawing') return;
    if (state.phase.drawerId !== connection.playerId) return;

    const runtime = this.#runtimeFor(connection.roomId);
    if (runtime === undefined) return;

    runtime.strokes.append(frame);
    for (const player of state.players) {
      if (player.id === connection.playerId) continue;
      const entry = this.#connections.get(player.id);
      if (entry !== undefined) sendBinary(entry.connection, frame);
    }
  }

  #tick(): void {
    const now = Date.now();
    for (const roomId of this.#store.ids()) {
      const runtime = this.#runtimeFor(roomId);
      runtime?.tick(now);

      if (runtime !== undefined && !runtime.hasPlayers()) {
        const since = this.#emptySince.get(roomId) ?? now;
        this.#emptySince.set(roomId, since);
        if (now - since >= EMPTY_ROOM_GRACE_MS) {
          this.#store.delete(roomId);
          this.#runtimes.delete(roomId);
          this.#emptySince.delete(roomId);
        }
      } else {
        this.#emptySince.delete(roomId);
      }
    }
  }
}

/**
 * Maps a validated client message to a game event. Returns null for messages
 * handled outside the reducer (join, undo, clear, pong).
 */
function toEvent(message: ClientMessage, playerId: PlayerId): GameEvent | null {
  switch (message.type) {
    case 'start':
      return { type: 'START_GAME', playerId };
    case 'settings':
      return { type: 'SETTINGS_CHANGED', playerId, settings: message.settings };
    case 'choose-word':
      return { type: 'WORD_CHOSEN', playerId, choiceIndex: message.index };
    case 'chat':
      return { type: 'GUESS', playerId, text: message.text };
    case 'kick':
      return { type: 'KICK', playerId, targetId: message.targetId, ban: message.ban };
    case 'votekick':
      return { type: 'VOTEKICK', playerId, targetId: message.targetId };
    default:
      return null;
  }
}

if (process.env['NODE_ENV'] !== 'test') {
  const server = new GameServer(Number(process.env['PORT'] ?? 3000));
  void server.start().then((url) => console.log(`scrible server listening on ${url}`));
}
