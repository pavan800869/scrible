import { buildMask } from './hints.js';
import type { ClientPhaseView, Player, PlayerId, RoomSettings, RoomState } from './types.js';

/** A player as a client sees them — the server-only `ip` field is gone. */
export type PublicPlayer = Omit<Player, 'ip'>;

export interface ClientRoomView {
  id: string;
  hostId: PlayerId | null;
  settings: RoomSettings;
  players: PublicPlayer[];
  turnOrder: PlayerId[];
  turnIndex: number;
  round: number;
  paused: boolean;
  phase: ClientPhaseView;
}

/**
 * Build the view a single player is allowed to see.
 *
 * The secret word is included ONLY for the drawer, for players who have
 * already guessed correctly, and once the word is public at turn-end.
 * Player IPs and ban records never leave the server.
 */
export function redactStateFor(state: RoomState, viewerId: PlayerId): ClientRoomView {
  return {
    id: state.id,
    hostId: state.hostId,
    settings: state.settings,
    players: state.players.map(({ ip: _ip, ...rest }) => rest),
    turnOrder: state.turnOrder,
    turnIndex: state.turnIndex,
    round: state.round,
    paused: state.pausedSince !== null,
    phase: redactPhase(state, viewerId),
  };
}

function redactPhase(state: RoomState, viewerId: PlayerId): ClientPhaseView {
  const phase = state.phase;

  switch (phase.name) {
    case 'lobby':
    case 'game-end':
      return { name: phase.name };

    case 'word-select':
      return {
        name: phase.name,
        drawerId: phase.drawerId,
        endsAt: phase.endsAt,
        ...(viewerId === phase.drawerId ? { choices: phase.choices } : {}),
      };

    case 'drawing': {
      const knowsWord =
        viewerId === phase.drawerId || phase.correct.some((c) => c.playerId === viewerId);

      return {
        name: phase.name,
        drawerId: phase.drawerId,
        endsAt: phase.endsAt,
        mask: buildMask(phase.word.text, new Set(phase.revealed), state.settings.mode),
        correctPlayerIds: phase.correct.map((c) => c.playerId),
        ...(knowsWord ? { word: phase.word.text } : {}),
      };
    }

    case 'turn-end':
      return {
        name: phase.name,
        word: phase.word,
        deltas: phase.deltas,
        endsAt: phase.endsAt,
      };

    case 'round-end':
      return { name: phase.name, endsAt: phase.endsAt };
  }
}
