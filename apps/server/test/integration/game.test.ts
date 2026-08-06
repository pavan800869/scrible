import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@scrible/protocol';
import { GameServer } from '../../src/index.js';

let server: GameServer;
let baseUrl: string;

beforeAll(async () => {
  server = new GameServer(0);
  baseUrl = await server.start();
});

afterAll(async () => {
  await server.stop();
});

type StateMessage = Extract<ServerMessage, { type: 'state' }>;
type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

const isState = (m: ServerMessage): m is StateMessage => m.type === 'state';
const isError = (m: ServerMessage): m is ErrorMessage => m.type === 'error';

/** A test client that records every server message it receives. */
class Client {
  readonly received: ServerMessage[] = [];
  #socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      this.received.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  static async connect(url: string): Promise<Client> {
    const socket = new WebSocket(url.replace('http', 'ws'));
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new Client(socket);
  }

  send(message: unknown): void {
    this.#socket.send(JSON.stringify(message));
  }

  close(): void {
    this.#socket.close();
  }

  /** Wait until a matching message arrives, or fail after the timeout. */
  async waitFor<T extends ServerMessage>(
    predicate: (m: ServerMessage) => m is T,
    timeoutMs = 3_000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find(predicate);
      if (found !== undefined) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timed out waiting for message');
  }

  latestState(): StateMessage | undefined {
    return this.received.filter(isState).at(-1);
  }
}

async function createRoom(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { rounds: 2, drawTimeSec: 15, hints: 0 } }),
  });
  return ((await res.json()) as { roomId: string }).roomId;
}

describe('a full two-player game', () => {
  it('plays from lobby through a scored guess', async () => {
    const roomId = await createRoom();

    const ada = await Client.connect(baseUrl);
    const bo = await Client.connect(baseUrl);

    ada.send({ type: 'join', roomId, name: 'Ada', avatarSeed: 'a' });
    bo.send({ type: 'join', roomId, name: 'Bo', avatarSeed: 'b' });

    await bo.waitFor(isState);
    await ada.waitFor((m): m is StateMessage => isState(m) && m.view.players.length === 2);

    ada.send({ type: 'start' });

    const selecting = await ada.waitFor(
      (m): m is StateMessage => isState(m) && m.view.phase.name === 'word-select',
    );

    const drawerId = selecting.view.phase.drawerId!;
    const drawerName = selecting.view.players.find((p) => p.id === drawerId)!.name;
    const drawer = drawerName === 'Ada' ? ada : bo;
    const guesser = drawer === ada ? bo : ada;

    // Only the drawer receives the word choices.
    await drawer.waitFor(
      (m): m is StateMessage => isState(m) && m.view.phase.choices !== undefined,
    );
    const drawerView = drawer.latestState()!;
    expect(drawerView.view.phase.choices).toBeDefined();
    expect(guesser.latestState()!.view.phase.choices).toBeUndefined();

    const secret = drawerView.view.phase.choices![0]!.text;

    drawer.send({ type: 'choose-word', index: 0 });

    await guesser.waitFor(
      (m): m is StateMessage => isState(m) && m.view.phase.name === 'drawing',
    );

    // The guesser must never have seen the secret in any frame.
    expect(JSON.stringify(guesser.received)).not.toContain(secret);

    guesser.send({ type: 'chat', text: secret });

    await guesser.waitFor(
      (m): m is StateMessage => isState(m) && m.view.phase.name === 'turn-end',
    );

    const final = guesser.latestState()!;
    const guesserName = drawer === ada ? 'Bo' : 'Ada';
    const scored = final.view.players.find((p) => p.name === guesserName)!;

    expect(scored.score).toBeGreaterThan(0);
    expect(final.view.players.find((p) => p.id === drawerId)!.score).toBeGreaterThan(0);

    ada.close();
    bo.close();
  }, 20_000);

  it('rejects a join to a room that does not exist', async () => {
    const client = await Client.connect(baseUrl);
    client.send({ type: 'join', roomId: 'zzzzzz', name: 'Ghost', avatarSeed: 'g' });

    const error = await client.waitFor(isError);
    expect(error.reason).toBe('no-such-room');
    client.close();
  });

  it('ignores a malformed frame without dropping the connection', async () => {
    const roomId = await createRoom();
    const client = await Client.connect(baseUrl);
    client.send({ type: 'join', roomId, name: 'Ada', avatarSeed: 'a' });
    await client.waitFor(isState);

    client.send({ type: 'not-a-real-message', nonsense: true });

    const error = await client.waitFor(isError);
    expect(error.reason).toBe('malformed');

    // Still usable afterwards.
    client.send({ type: 'chat', text: 'still here' });
    client.close();
  });
});
