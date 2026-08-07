import { useEffect, useState } from 'react';
import type { ClientRoomView } from '@scrible/protocol';
import { Character } from '../components/Character.js';
import { Confetti } from '../components/Confetti.js';
import { Icon } from '../components/Icon.js';
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
  const connected = view.players.filter((p) => p.connected).length;
  const canRestart = isHost && connected >= 2;
  const [burst, setBurst] = useState(0);

  // Optimistic: the button latches the moment it is pressed, and unlatches only
  // if the server has not moved the room on. Without it a host who sees nothing
  // happen for a tick assumes it is broken and mashes the button.
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    if (!restarting) return;
    const id = window.setTimeout(() => setRestarting(false), 3_000);
    return () => window.clearTimeout(id);
  }, [restarting]);

  useEffect(() => setBurst(1), []);

  return (
    <main className="podium">
      <Confetti trigger={burst} />

      <div className="podium-card panel">
        {winner !== undefined && (
          <div className="winner-stage">
            <div className="winner-portrait">
              <Character seed={winner.avatarSeed} mood="winner" size={132} />
              <Icon name="crown" size={20} className="winner-crown" />
            </div>
            <div className="winner-copy">
              <span className="eyebrow">Winner</span>
              <h1 className="winner-name">
                {winner.name}
                <em>.</em>
              </h1>
              <p className="winner-meta">
                <span>{creatureFrom(winner.avatarSeed).species}</span>
                <span className="winner-dot" />
                <span>{winner.score.toLocaleString()} points</span>
              </p>
            </div>
          </div>
        )}

        <div className="podium-list">
          {ranked.map((player, index) => (
            <div
              className={`podium-row${index === 0 ? ' is-first' : ''}${player.connected ? '' : ' is-gone'}`}
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
                {player.id === selfId && <span className="tag tag-you">You</span>}
                {!player.connected && <span className="tag">Away</span>}
              </span>
              <span className="player-score">{player.score.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="podium-actions">
          <button
            className="btn btn-primary btn-big"
            onClick={() => {
              setRestarting(true);
              onPlayAgain();
            }}
            disabled={!canRestart || restarting}
          >
            {restarting ? 'Starting…' : 'Play again'}
          </button>
          <button className="btn btn-big" onClick={onLeave}>
            Leave
          </button>
        </div>

        {!canRestart && (
          <p className="setting-hint podium-hint">
            {!isHost
              ? 'Only the host can start another game.'
              : 'You need one more player before you can go again.'}
          </p>
        )}
      </div>
    </main>
  );
}
