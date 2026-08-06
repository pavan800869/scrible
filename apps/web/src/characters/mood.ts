import type { ClientRoomView } from '@scrible/protocol';
import type { Mood } from './traits.js';

/**
 * What face a creature is wearing right now.
 *
 * The roster is where most of the game's feedback lands, so the faces have to
 * track the actual state: who is drawing, who has it, who just whiffed.
 */
export function moodFor(view: ClientRoomView, playerId: string): Mood {
  const phase = view.phase;

  if (phase.name === 'game-end') {
    const best = Math.max(...view.players.map((p) => p.score), 0);
    const player = view.players.find((p) => p.id === playerId);
    return player !== undefined && player.score === best && best > 0 ? 'winner' : 'sad';
  }

  if (phase.drawerId === playerId) return 'drawing';

  if ((phase.correctPlayerIds ?? []).includes(playerId)) return 'happy';

  if (phase.name === 'turn-end') {
    const delta = phase.deltas?.[playerId] ?? 0;
    return delta > 0 ? 'happy' : 'sad';
  }

  if (phase.name === 'drawing') return 'thinking';

  return 'idle';
}
