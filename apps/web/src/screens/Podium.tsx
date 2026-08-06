import { useEffect, useState } from 'react';
import type { ClientRoomView } from '@scrible/protocol';
import { Character } from '../components/Character.js';
import { Confetti } from '../components/Confetti.js';
import { creatureFrom } from '../characters/traits.js';

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
  const [burst, setBurst] = useState(0);

  useEffect(() => setBurst(1), []);

  return (
    <main className="podium">
      <Confetti trigger={burst} />

      <div className="podium-card panel">
        {winner !== undefined && (
          <div className="winner-stage">
            <Character seed={winner.avatarSeed} mood="winner" size={140} />
            <div>
              <span className="eyebrow">Winner</span>
              <h1 className="wordmark" style={{ fontSize: 34, marginTop: 4 }}>
                {winner.name}
                <em>.</em>
              </h1>
              <p className="tagline" style={{ fontSize: 14 }}>
                {creatureFrom(winner.avatarSeed).species} · {winner.score} points
              </p>
            </div>
          </div>
        )}

        <div className="podium-list">
          {ranked.map((player, index) => (
            <div
              className={`podium-row${index === 0 ? ' is-first' : ''}`}
              key={player.id}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="podium-rank">{index + 1}</span>
              <Character
                seed={player.avatarSeed}
                mood={index === 0 ? 'winner' : 'idle'}
                size={40}
                still
              />
              <span className="player-name">
                {player.name}
                {player.id === selfId ? ' (you)' : ''}
              </span>
              <span className="player-score">{player.score}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary btn-big" onClick={onPlayAgain} disabled={!isHost}>
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
