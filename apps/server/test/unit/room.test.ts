import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServerMessage } from '@scrible/protocol';
import { MemoryRoomStore } from '../../src/rooms/store.js';
import { RoomRuntime, type Transport } from '../../src/rooms/room.js';

class FakeTransport implements Transport {
  sent: { playerId: string; message: ServerMessage }[] = [];
  closed: string[] = [];
  send(playerId: string, message: ServerMessage) { this.sent.push({ playerId, message }); }
  sendBinary() { /* not used in these tests */ }
  close(playerId: string) { this.closed.push(playerId); }

  messagesTo(playerId: string) {
    return this.sent.filter((s) => s.playerId === playerId).map((s) => s.message);
  }
  reset() { this.sent = []; this.closed = []; }
}

describe('RoomRuntime', () => {
  let store: MemoryRoomStore;
  let transport: FakeTransport;
  let runtime: RoomRuntime;

  beforeEach(() => {
    store = new MemoryRoomStore();
    transport = new FakeTransport();
    const room = store.create(DEFAULT_SETTINGS);
    runtime = new RoomRuntime(room.id, store, transport);
    runtime.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ada', avatarSeed: 'a', ip: '1.1.1.1' }, 0);
    runtime.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bo', avatarSeed: 'b', ip: '2.2.2.2' }, 0);
    transport.reset();
  });

  it('broadcasts a redacted state to every player', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    expect(transport.messagesTo('p1').some((m) => m.type === 'state')).toBe(true);
    expect(transport.messagesTo('p2').some((m) => m.type === 'state')).toBe(true);
  });

  it('never sends the word to a non-drawer', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    const other = drawerId === 'p1' ? 'p2' : 'p1';

    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);

    const live = store.get(runtime.id)!;
    if (live.phase.name !== 'drawing') throw new Error('expected drawing');
    const secret = live.phase.word.text;

    expect(JSON.stringify(transport.messagesTo(other))).not.toContain(secret);
  });

  it('clears the stroke log when a turn starts', () => {
    runtime.strokes.append(new Uint8Array([9]));
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);
    expect(runtime.strokes.log()).toEqual([]);
  });

  it('routes guessed-scope chat only to correct guessers and the drawer', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);

    const live = store.get(runtime.id)!;
    if (live.phase.name !== 'drawing') throw new Error('expected drawing');
    const guesser = live.players.find((p) => p.id !== drawerId)!.id;

    runtime.dispatch({ type: 'GUESS', playerId: guesser, text: live.phase.word.text }, 1_000);
    transport.reset();
    runtime.dispatch({ type: 'GUESS', playerId: guesser, text: 'good one' }, 2_000);

    const toDrawer = transport.messagesTo(drawerId).filter((m) => m.type === 'chat');
    expect(toDrawer.some((m) => m.type === 'chat' && m.text === 'good one')).toBe(true);
  });

  it('restarts from the podium and wipes the finished game off the canvas', () => {
    // The podium is the `game-end` phase; "Play again" is a START_GAME from it.
    const finished = store.get(runtime.id)!;
    store.set({ ...finished, phase: { name: 'game-end' } });
    runtime.strokes.append(new Uint8Array([9]));
    transport.reset();

    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);

    expect(store.get(runtime.id)!.phase.name).toBe('word-select');
    expect(runtime.strokes.log()).toEqual([]);
    expect(transport.messagesTo('p2').some((m) => m.type === 'clear')).toBe(true);
  });

  it('closes the socket of a kicked player', () => {
    runtime.dispatch({ type: 'KICK', playerId: 'p1', targetId: 'p2', ban: false }, 0);
    expect(transport.closed).toContain('p2');
  });

  it('reports when the room is empty so it can be reaped', () => {
    runtime.dispatch({ type: 'KICK', playerId: 'p1', targetId: 'p2', ban: false }, 0);
    expect(runtime.hasPlayers()).toBe(true);
    runtime.dispatch({ type: 'PLAYER_LEFT', playerId: 'p1' }, 0);
    runtime.tick(200_000);
    expect(runtime.hasPlayers()).toBe(false);
  });
});
