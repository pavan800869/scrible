import type { ClientRoomView, ServerMessage } from '@scrible/protocol';

export interface ChatEntry {
  id: number;
  from: string | null;
  text: string;
  kind: 'message' | 'system' | 'correct' | 'close' | 'warning';
  scope: 'all' | 'guessed' | 'private';
}

export interface ClientHandlers {
  onView(view: ClientRoomView): void;
  onWelcome(playerId: string, rejoinToken: string, view: ClientRoomView): void;
  onChat(entry: Omit<ChatEntry, 'id'>): void;
  onStroke(frame: Uint8Array): void;
  onClear(): void;
  onUndo(strokeCount: number): void;
  onStatus(status: ConnectionStatus, reason?: string): void;
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

const RECONNECT_DELAYS_MS = [400, 900, 2_000, 4_000, 8_000];

/**
 * One WebSocket, two framings: JSON for control, binary for strokes.
 *
 * Reconnects with backoff and replays the stored rejoin token, so a dropped
 * connection restores the player's seat rather than costing them their score.
 */
export class GameClient {
  #socket: WebSocket | null = null;
  #handlers: ClientHandlers;
  #attempt = 0;
  #closedByUs = false;
  #join: { roomId: string; name: string; avatarSeed: string } | null = null;
  #rejoinToken: string | null = null;

  constructor(handlers: ClientHandlers) {
    this.#handlers = handlers;
  }

  connect(join: { roomId: string; name: string; avatarSeed: string; rejoinToken?: string }): void {
    this.#join = { roomId: join.roomId, name: join.name, avatarSeed: join.avatarSeed };
    this.#rejoinToken = join.rejoinToken ?? null;
    this.#closedByUs = false;
    this.#open();
  }

  disconnect(): void {
    this.#closedByUs = true;
    this.#socket?.close();
    this.#socket = null;
  }

  send(message: unknown): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(JSON.stringify(message));
  }

  sendStroke(frame: Uint8Array): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(frame);
  }

  #open(): void {
    const join = this.#join;
    if (join === null) return;

    this.#handlers.onStatus('connecting');

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${window.location.host}/ws`);
    socket.binaryType = 'arraybuffer';
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.#handlers.onStatus('open');
      this.send({
        type: 'join',
        roomId: join.roomId,
        name: join.name,
        avatarSeed: join.avatarSeed,
        ...(this.#rejoinToken !== null ? { rejoinToken: this.#rejoinToken } : {}),
      });
    });

    socket.addEventListener('message', (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.#handlers.onStroke(new Uint8Array(event.data));
        return;
      }
      this.#onControl(String(event.data));
    });

    socket.addEventListener('close', () => {
      if (this.#closedByUs) {
        this.#handlers.onStatus('closed');
        return;
      }
      this.#scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.#handlers.onStatus('error');
    });
  }

  #onControl(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'welcome':
        this.#rejoinToken = message.rejoinToken;
        this.#handlers.onWelcome(message.playerId, message.rejoinToken, message.view);
        break;
      case 'state':
        this.#handlers.onView(message.view);
        break;
      case 'chat':
        this.#handlers.onChat({
          from: message.from,
          text: message.text,
          kind: message.kind,
          scope: message.scope,
        });
        break;
      case 'private':
        this.#handlers.onChat({
          from: null,
          text:
            message.kind === 'close'
              ? `"${message.text}" is close.`
              : message.text,
          kind: message.kind,
          scope: 'private',
        });
        break;
      case 'clear':
        this.#handlers.onClear();
        break;
      case 'undo':
        this.#handlers.onUndo(message.strokeCount);
        break;
      case 'error':
        this.#closedByUs = true;
        this.#handlers.onStatus('error', message.reason);
        break;
      case 'ping':
        this.send({ type: 'pong' });
        break;
    }
  }

  #scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.#attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.#attempt += 1;
    this.#handlers.onStatus('connecting');
    window.setTimeout(() => {
      if (!this.#closedByUs) this.#open();
    }, delay);
  }
}
