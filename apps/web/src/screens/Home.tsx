import { useState } from 'react';
import { Character } from '../components/Character.js';
import { CREATURE_COUNT, creatureFrom, type Mood } from '../characters/traits.js';
import { freshSeed } from '../state/store.js';

interface HomeProps {
  name: string;
  avatarSeed: string;
  error: string | null;
  onProfile: (name: string, seed: string) => void;
  onJoin: (roomId: string) => void;
  onCreate: () => Promise<string>;
}

const REASON_COPY: Record<string, string> = {
  'no-such-room': 'That room code has expired. Ask for a fresh link, or start a new game.',
  'room-full': 'That room is full. Try again once someone leaves.',
  banned: 'You were removed from that room.',
  malformed: 'The connection got confused. Reload and try again.',
};

const DEMO_MOODS: Mood[] = ['idle', 'happy', 'thinking', 'drawing'];

export function Home({ name, avatarSeed, error, onProfile, onJoin, onCreate }: HomeProps) {
  const [draftName, setDraftName] = useState(name);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [moodIndex, setMoodIndex] = useState(0);

  const trimmed = draftName.trim();
  const ready = trimmed.length > 0;
  const creature = creatureFrom(avatarSeed);

  async function create() {
    if (!ready) return;
    setBusy(true);
    onProfile(trimmed, avatarSeed);
    try {
      onJoin(await onCreate());
    } finally {
      setBusy(false);
    }
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    const roomId = code.trim().toLowerCase();
    if (!ready || roomId.length < 4) return;
    onProfile(trimmed, avatarSeed);
    onJoin(roomId);
  }

  return (
    <main className="home">
      <div className="home-card panel">
        <div className="home-hero">
          <h1 className="wordmark">
            scrible<em>.</em>
          </h1>
          <p className="tagline">Draw badly. Guess loudly. Talk over each other.</p>
        </div>

        {error !== null && (
          <p className="notice">{REASON_COPY[error] ?? 'Something went wrong. Try again.'}</p>
        )}

        <div className="picker-stage">
          <button
            className="creature-stage"
            onClick={() => setMoodIndex((i) => (i + 1) % DEMO_MOODS.length)}
            title="Poke them"
            aria-label="Change your character's expression"
          >
            <Character seed={avatarSeed} mood={DEMO_MOODS[moodIndex]!} size={104} />
          </button>

          <div className="creature-id">
            <span className="species-badge">{creature.species}</span>
            <button
              className="btn btn-reroll"
              onClick={() => onProfile(trimmed, freshSeed())}
              title={`${CREATURE_COUNT.toLocaleString()} possible creatures`}
            >
              ⟳ New creature
            </button>
          </div>
        </div>

        <input
          className="field field-name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="What should we call you?"
          maxLength={20}
          aria-label="Your name"
        />

        <button className="btn btn-primary btn-big" onClick={() => void create()} disabled={!ready || busy}>
          {busy ? 'Setting up…' : 'Start a game'}
        </button>

        <div className="divider">or join one</div>

        <form className="home-split" onSubmit={join}>
          <input
            className="field field-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="room code"
            maxLength={16}
            aria-label="Room code"
            autoComplete="off"
          />
          <button className="btn" type="submit" disabled={!ready || code.trim().length < 4}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
