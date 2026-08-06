import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { DEFAULT_SETTINGS, roomSettingsSchema } from '@scrible/protocol';
import type { RoomStore } from './rooms/store.js';
import { verifyRejoinToken } from './net/rejoin.js';
import type { VoiceService } from './voice/tokens.js';

export interface AppDeps {
  store: RoomStore;
  secret: string;
  voice?: VoiceService;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/rooms', async (request, reply) => {
    const body = (request.body ?? {}) as { settings?: unknown };
    const merged = { ...DEFAULT_SETTINGS, ...((body.settings as object | undefined) ?? {}) };
    const parsed = roomSettingsSchema.safeParse(merged);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-settings', issues: parsed.error.issues });
    }

    const room = deps.store.create(parsed.data);
    return { roomId: room.id };
  });

  /**
   * Mint a LiveKit token.
   *
   * Authorisation is the rejoin token the server already issued over the
   * socket. That proves the caller holds a real seat in this room, so a player
   * id alone is never enough to get audio access.
   */
  app.post('/api/voice/token', async (request, reply) => {
    const voice = deps.voice;
    if (voice === undefined || !voice.configured) {
      return reply.code(503).send({ error: 'voice-not-configured' });
    }

    const body = (request.body ?? {}) as { roomId?: unknown; rejoinToken?: unknown };
    if (typeof body.roomId !== 'string' || typeof body.rejoinToken !== 'string') {
      return reply.code(400).send({ error: 'bad-request' });
    }

    const claim = verifyRejoinToken(deps.secret, body.rejoinToken);
    if (claim === null || claim.roomId !== body.roomId) {
      return reply.code(403).send({ error: 'not-in-room' });
    }

    const player = deps.store.get(body.roomId)?.players.find((p) => p.id === claim.playerId);
    if (player === undefined) {
      return reply.code(403).send({ error: 'not-in-room' });
    }

    const token = await voice.mint({
      roomId: body.roomId,
      playerId: player.id,
      name: player.name,
    });

    return { url: voice.url, token };
  });

  // In production the API and the SPA share an origin, so there is no CORS surface.
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url === '/health') {
        return reply.code(404).send({ error: 'not-found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
