import type { ClientRoomView } from '@scrible/protocol';
import { Avatar } from '../components/Avatar.js';

interface PodiumProps {
  view: ClientRoomView;
  selfId: string | null;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function Podium({ view, selfId, onPlayAgain, onLeave }: PodiumProps) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const isHost = view.hostId === selfId;

  return (
    <main className="podium">
      <div className="podium-card panel">
        <div>
          <span className="eyebrow">Final scores</span>
          <h1 className="wordmark" style={{ fontSize: 32, marginTop: 6 }}>
            {winner !== undefined ? (
              <>
                {winner.name} wins<em>.</em>
              </>
            ) : (
              <>Game over<em>.</em></>
            )}
          </h1>
        </div>

        <div className="podium-list">
          {ranked.map((player, index) => (
            <div
              className={`podium-row${index === 0 ? ' is-first' : ''}`}
              key={player.id}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="podium-rank">{index + 1}</span>
              <Avatar name={player.name} seed={player.avatarSeed} />
              <span className="player-name">
                {player.name}
                {player.id === selfId ? ' (you)' : ''}
              </span>
              <span className="player-score">{player.score}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={onPlayAgain} disabled={!isHost}>
            {isHost ? 'Play again' : 'Waiting for the host'}
          </button>
          <button className="btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </main>
  );
}
