import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_SETTINGS, roomSettingsSchema } from '@scrible/protocol';
import type { RoomStore } from './rooms/store.js';

export function buildApp(deps: { store: RoomStore }): FastifyInstance {
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

  return app;
}
