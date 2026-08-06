import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@scrible/protocol';
import { MemoryRoomStore } from '../../src/rooms/store.js';

describe('MemoryRoomStore', () => {
  it('creates a room with a short id', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    expect(room.id).toMatch(/^[a-z0-9]{6}$/);
  });

  it('round-trips a room', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    expect(store.get(room.id)?.id).toBe(room.id);
  });

  it('returns undefined for an unknown id', () => {
    expect(new MemoryRoomStore().get('nope99')).toBeUndefined();
  });

  it('deletes a room', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    store.delete(room.id);
    expect(store.get(room.id)).toBeUndefined();
  });

  it('generates distinct ids', () => {
    const store = new MemoryRoomStore();
    const ids = new Set(Array.from({ length: 50 }, () => store.create(DEFAULT_SETTINGS).id));
    expect(ids.size).toBe(50);
  });
});
