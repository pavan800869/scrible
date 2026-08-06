import type { ClientRoomView } from '@scrible/protocol';
import { Avatar } from './Avatar.js';

interface RosterProps {
  view: ClientRoomView;
  selfId: string | null;
  speaking: ReadonlySet<string>;
  onKick?: (playerId: string) => void;
}

export function Roster({ view, selfId, speaking, onKick }: RosterProps) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score);
  const drawerId = view.phase.drawerId;
  const correct = new Set(view.phase.correctPlayerIds ?? []);
  const deltas = view.phase.deltas;
  const isHost = view.hostId === selfId;

  return (
    <div className="roster panel">
      <div className="roster-head">
        <span className="eyebrow">Players</span>
        <span className="eyebrow">{view.players.length}</span>
      </div>

      {ranked.map((player) => {
        const classes = ['player'];
        if (correct.has(player.id)) classes.push('is-guessed');
        if (player.id === drawerId) classes.push('is-drawing');
        if (!player.connected) classes.push('is-gone');

        const delta = deltas?.[player.id];

        return (
          <div className={classes.join(' ')} key={player.id}>
            <Avatar
              name={player.name}
              seed={player.avatarSeed}
              speaking={speaking.has(player.id)}
            />

            <div style={{ minWidth: 0 }}>
              <div className="player-name">
                {player.name}
                {player.id === selfId ? ' (you)' : ''}
              </div>
              <div className="player-meta">
                {view.hostId === player.id && <span>Host</span>}
                {player.id === drawerId && <span>Drawing</span>}
                {correct.has(player.id) && <span>Guessed</span>}
                {!player.connected && <span>Away</span>}
              </div>
            </div>

            {delta !== undefined && delta > 0 ? (
              <span className="player-delta">+{delta}</span>
            ) : (
              <span className="player-score">{player.score}</span>
            )}

            {isHost && player.id !== selfId && onKick !== undefined && (
              <button
                className="btn-ghost"
                style={{ padding: '2px 6px', fontSize: 12 }}
                onClick={() => onKick(player.id)}
                aria-label={`Remove ${player.name}`}
                title={`Remove ${player.name}`}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
