import { createRoom, type RoomId, type RoomSettings, type RoomState } from '@scrible/protocol';

export interface RoomStore {
  create(settings: RoomSettings): RoomState;
  get(id: RoomId): RoomState | undefined;
  set(state: RoomState): void;
  delete(id: RoomId): void;
  ids(): RoomId[];
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 6;

/**
 * In-memory implementation. This is the seam for a future Redis backend —
 * swapping persistence means writing one more class, not touching callers.
 */
export class MemoryRoomStore implements RoomStore {
  #rooms = new Map<RoomId, RoomState>();

  create(settings: RoomSettings): RoomState {
    const room = createRoom({ id: this.#freshId(), settings });
    this.#rooms.set(room.id, room);
    return room;
  }

  get(id: RoomId): RoomState | undefined {
    return this.#rooms.get(id);
  }

  set(state: RoomState): void {
    this.#rooms.set(state.id, state);
  }

  delete(id: RoomId): void {
    this.#rooms.delete(id);
  }

  ids(): RoomId[] {
    return [...this.#rooms.keys()];
  }

  #freshId(): RoomId {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = Array.from(
        { length: ID_LENGTH },
        () => ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)],
      ).join('');
      if (!this.#rooms.has(id)) return id;
    }
    throw new Error('could not allocate a unique room id');
  }
}
