import type { ClientRoomView } from '@scrible/protocol';
import { Character } from './Character.js';
import { Icon } from './Icon.js';
import { moodFor } from '../characters/mood.js';
import { creatureFrom } from '../characters/traits.js';

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
  const leader = ranked[0];

  return (
    <div className="roster panel">
      <div className="roster-head">
        <span className="eyebrow">Players</span>
        <span className="eyebrow">{view.players.length}</span>
      </div>

      {ranked.map((player, index) => {
        const classes = ['player'];
        if (correct.has(player.id)) classes.push('is-guessed');
        if (player.id === drawerId) classes.push('is-drawing');
        if (!player.connected) classes.push('is-gone');

        const delta = deltas?.[player.id];
        const creature = creatureFrom(player.avatarSeed);
        const isLeader = index === 0 && player.score > 0 && leader !== undefined;

        return (
          <div className={classes.join(' ')} key={player.id}>
            <div className="player-face">
              <Character
                seed={player.avatarSeed}
                mood={moodFor(view, player.id)}
                size={40}
                speaking={speaking.has(player.id)}
                away={!player.connected}
              />
              {isLeader && (
                <span className="crown" title="Leading">
                  <Icon name="crown" size={13} label="Leading" />
                </span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div className="player-name">
                {player.name}
                {player.id === selfId && <span className="tag tag-you">You</span>}
              </div>
              <div className="player-meta">
                <span className="species">{creature.species}</span>
                {view.hostId === player.id && <span className="tag tag-host">Host</span>}
                {player.id === drawerId && <span className="tag tag-draw">Drawing</span>}
                {correct.has(player.id) && <span className="tag tag-got">Got it</span>}
                {!player.connected && <span className="tag">Away</span>}
              </div>
            </div>

            {delta !== undefined && delta > 0 ? (
              <span className="player-delta">+{delta}</span>
            ) : (
              <span className="player-score">{player.score}</span>
            )}

            {isHost && player.id !== selfId && onKick !== undefined && (
              <button
                className="kick"
                onClick={() => onKick(player.id)}
                aria-label={`Remove ${player.name}`}
                title={`Remove ${player.name}`}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
