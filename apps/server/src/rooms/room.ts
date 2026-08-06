import {
  redactStateFor,
  reduce,
  type Effect,
  type GameEvent,
  type PlayerId,
  type RoomId,
  type RoomState,
  type ServerMessage,
} from '@scrible/protocol';
import { pickWords } from '@scrible/words';
import { StrokeRelay } from '../net/strokes.js';
import type { RoomStore } from './store.js';

export interface Transport {
  send(playerId: PlayerId, message: ServerMessage): void;
  sendBinary(playerId: PlayerId, frame: Uint8Array): void;
  close(playerId: PlayerId): void;
}

export class RoomRuntime {
  readonly strokes = new StrokeRelay();

  constructor(
    readonly id: RoomId,
    private readonly store: RoomStore,
    private readonly transport: Transport,
  ) {}

  dispatch(event: GameEvent, now: number): void {
    const before = this.store.get(this.id);
    if (before === undefined) return;

    const { state, effects } = reduce(before, event, { now, random: Math.random, pickWords });
    this.store.set(state);
    this.#runEffects(state, effects);
  }

  tick(now: number): void {
    this.dispatch({ type: 'TICK' }, now);
  }

  hasPlayers(): boolean {
    return (this.store.get(this.id)?.players.length ?? 0) > 0;
  }

  broadcastState(): void {
    const state = this.store.get(this.id);
    if (state === undefined) return;
    for (const player of state.players) {
      this.transport.send(player.id, { type: 'state', view: redactStateFor(state, player.id) });
    }
  }

  #runEffects(state: RoomState, effects: readonly Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'BROADCAST_STATE':
          this.broadcastState();
          break;

        case 'CHAT':
          this.#chat(state, effect);
          break;

        case 'PRIVATE':
          this.transport.send(effect.playerId, {
            type: 'private',
            text: effect.text,
            kind: effect.kind,
          });
          break;

        case 'CLEAR_CANVAS':
          this.strokes.clear();
          for (const player of state.players) this.transport.send(player.id, { type: 'clear' });
          break;

        case 'REJECT':
          this.transport.send(effect.playerId, { type: 'error', reason: effect.reason });
          this.transport.close(effect.playerId);
          break;

        case 'DISCONNECT':
          this.transport.close(effect.playerId);
          break;

        case 'REVOKE_VOICE':
          // Implemented in the voice plan; a no-op until LiveKit is wired.
          break;
      }
    }
  }

  #chat(state: RoomState, effect: Extract<Effect, { type: 'CHAT' }>): void {
    const recipients =
      effect.scope === 'all' ? state.players.map((p) => p.id) : guessedAudience(state);

    for (const playerId of recipients) {
      this.transport.send(playerId, {
        type: 'chat',
        from: effect.from,
        text: effect.text,
        kind: effect.kind,
        scope: effect.scope,
      });
    }
  }
}

/** Correct guessers plus the drawer — the only people who already know the word. */
function guessedAudience(state: RoomState): PlayerId[] {
  if (state.phase.name !== 'drawing') return state.players.map((p) => p.id);
  return [state.phase.drawerId, ...state.phase.correct.map((c) => c.playerId)];
}
