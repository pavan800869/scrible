import { create } from 'zustand';
import type { ClientRoomView } from '@scrible/protocol';
import type { ChatEntry, ConnectionStatus } from '../net/client.js';

const NAME_KEY = 'scrible.name';
const SEED_KEY = 'scrible.avatarSeed';

export interface GameState {
  status: ConnectionStatus | 'idle';
  errorReason: string | null;
  playerId: string | null;
  roomId: string | null;
  view: ClientRoomView | null;
  chat: ChatEntry[];
  name: string;
  avatarSeed: string;
  /** Player ids currently composing a message. Ephemeral, never persisted. */
  typing: string[];

  setStatus(status: ConnectionStatus | 'idle', reason?: string): void;
  setIdentity(playerId: string, roomId: string): void;
  setView(view: ClientRoomView): void;
  addChat(entry: Omit<ChatEntry, 'id'>): void;
  setTyping(playerId: string, on: boolean): void;
  setProfile(name: string, avatarSeed: string): void;
  reset(): void;
}

const MAX_CHAT = 200;
let chatId = 0;

export const useGame = create<GameState>((set) => ({
  status: 'idle',
  errorReason: null,
  playerId: null,
  roomId: null,
  view: null,
  chat: [],
  name: localStorage.getItem(NAME_KEY) ?? '',
  avatarSeed: localStorage.getItem(SEED_KEY) ?? freshSeed(),

  typing: [],

  setStatus: (status, reason) => set({ status, errorReason: reason ?? null }),
  setIdentity: (playerId, roomId) => set({ playerId, roomId }),
  setView: (view) => set({ view }),

  setTyping: (playerId, on) =>
    set((prev) => ({
      typing: on
        ? prev.typing.includes(playerId)
          ? prev.typing
          : [...prev.typing, playerId]
        : prev.typing.filter((id) => id !== playerId),
    })),

  addChat: (entry) =>
    set((prev) => ({
      chat: [...prev.chat, { ...entry, id: chatId++ }].slice(-MAX_CHAT),
    })),

  setProfile: (name, avatarSeed) => {
    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(SEED_KEY, avatarSeed);
    set({ name, avatarSeed });
  },

  reset: () => set({ status: 'idle', errorReason: null, view: null, chat: [], roomId: null }),
}));

export function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Rejoin tokens are per-room and must not outlive the tab. */
export function readRejoinToken(roomId: string): string | undefined {
  return sessionStorage.getItem(`scrible.rejoin.${roomId}`) ?? undefined;
}

export function writeRejoinToken(roomId: string, token: string): void {
  sessionStorage.setItem(`scrible.rejoin.${roomId}`, token);
}
