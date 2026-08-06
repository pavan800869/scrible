import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '../net/client.js';

interface ChatProps {
  entries: ChatEntry[];
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
}

const CLASS_BY_KIND: Record<ChatEntry['kind'], string> = {
  message: '',
  system: 'chat-system',
  correct: 'chat-correct',
  close: 'chat-close',
  warning: 'chat-warning',
};

export function Chat({ entries, disabled, placeholder, onSend }: ChatProps) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [entries.length]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="chat panel">
      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Chat">
        {entries.map((entry) => {
          const classes = ['chat-line', CLASS_BY_KIND[entry.kind]];
          if (entry.scope === 'guessed' && entry.kind === 'message') classes.push('chat-guessed');

          return (
            <div className={classes.filter(Boolean).join(' ')} key={entry.id}>
              {entry.from !== null && <b>{entry.from}: </b>}
              {entry.text}
            </div>
          );
        })}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          className="field"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={200}
          aria-label="Your guess"
          autoComplete="off"
        />
        <button className="btn" type="submit" disabled={disabled || draft.trim().length === 0}>
          Send
        </button>
      </form>
    </div>
  );
}
