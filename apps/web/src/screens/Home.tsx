import { useState } from 'react';
import { Avatar } from '../components/Avatar.js';
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

export function Home({ name, avatarSeed, error, onProfile, onJoin, onCreate }: HomeProps) {
  const [draftName, setDraftName] = useState(name);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = draftName.trim();
  const ready = trimmed.length > 0;

  async function create() {
    if (!ready) return;
    setBusy(true);
    onProfile(trimmed, avatarSeed);
    try {
      const roomId = await onCreate();
      onJoin(roomId);
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
        <div>
          <h1 className="wordmark">
            scrible<em>.</em>
          </h1>
          <p className="tagline">Draw badly. Guess loudly. Voice included.</p>
        </div>

        {error !== null && (
          <p className="notice">{REASON_COPY[error] ?? 'Something went wrong. Try again.'}</p>
        )}

        <div className="home-row">
          <span className="eyebrow">You</span>
          <div className="avatar-picker">
            <Avatar name={trimmed.length > 0 ? trimmed : '?'} seed={avatarSeed} large />
            <input
              className="field"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Your name"
              maxLength={20}
              aria-label="Your name"
            />
            <button
              className="btn"
              onClick={() => onProfile(trimmed, freshSeed())}
              title="New colour"
              aria-label="New avatar colour"
            >
              ⟳
            </button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => void create()} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Start a new game'}
        </button>

        <div className="divider">or join one</div>

        <form className="home-split" onSubmit={join}>
          <input
            className="field"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Room code"
            maxLength={16}
            aria-label="Room code"
            autoComplete="off"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
          />
          <button className="btn" type="submit" disabled={!ready || code.trim().length < 4}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
