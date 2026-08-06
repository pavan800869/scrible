import { describe, expect, it } from 'vitest';
import { MemoryRoomStore } from '../../src/rooms/store.js';
import { buildApp } from '../../src/http.js';

const app = buildApp({ store: new MemoryRoomStore(), secret: 'test-secret' });

describe('HTTP API', () => {
  it('reports voice unavailable when LiveKit is not configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/voice/token',
      payload: { roomId: 'abc123', rejoinToken: 'anything' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('creates a room with default settings', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().roomId).toMatch(/^[a-z0-9]{6}$/);
  });

  it('rejects invalid settings', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/rooms', payload: { settings: { rounds: 99 } },
    });
    expect(res.statusCode).toBe(400);
  });
});
