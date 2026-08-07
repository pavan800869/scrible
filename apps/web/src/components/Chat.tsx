import { useEffect, useRef, useState } from 'react';
import type { ChatEntry } from '../net/client.js';

interface ChatProps {
  entries: ChatEntry[];
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  /** Chat carries player ids on the wire; the roster is what knows their names. */
  nameOf: (playerId: string) => string;
  /** Ids of other players composing right now. */
  typing: string[];
  onTyping: (on: boolean) => void;
  title?: string;
}

const CLASS_BY_KIND: Record<ChatEntry['kind'], string> = {
  message: '',
  system: 'chat-system',
  correct: 'chat-correct',
  close: 'chat-close',
  warning: 'chat-warning',
};

/** How long a pause counts as "stopped typing". */
const TYPING_IDLE_MS = 2200;

export function Chat(props: ChatProps) {
  const { entries, disabled, placeholder, onSend, nameOf, typing, onTyping } = props;
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const isTyping = useRef(false);
  const idleTimer = useRef<number>(0);

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [entries.length, typing.length]);

  // Never leave a stale "still typing" behind on unmount.
  useEffect(() => {
    return () => {
      window.clearTimeout(idleTimer.current);
      if (isTyping.current) onTyping(false);
    };
  }, [onTyping]);

  function stopTyping() {
    window.clearTimeout(idleTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      onTyping(false);
    }
  }

  function onChange(value: string) {
    setDraft(value);

    if (value.trim().length === 0) {
      stopTyping();
      return;
    }

    if (!isTyping.current) {
      isTyping.current = true;
      onTyping(true);
    }

    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text);
    setDraft('');
    stopTyping();
  }

  return (
    <div className="chat panel">
      {props.title !== undefined && (
        <div className="chat-head">
          <span className="eyebrow">{props.title}</span>
        </div>
      )}

      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Chat">
        {entries.length === 0 && (
          <p className="chat-empty">Say hello while you wait.</p>
        )}

        {entries.map((entry) => {
          const classes = ['chat-line', CLASS_BY_KIND[entry.kind]];
          if (entry.scope === 'guessed' && entry.kind === 'message') classes.push('chat-guessed');

          if (entry.kind === 'close') {
            return (
              <div className="chat-line chat-close" key={entry.id}>
                <span className="chat-badge">So close</span>
                <span>
                  <b>{entry.text}</b> is nearly it — keep going.
                </span>
              </div>
            );
          }

          return (
            <div className={classes.filter(Boolean).join(' ')} key={entry.id}>
              {entry.from !== null && <b>{nameOf(entry.from)}: </b>}
              {entry.text}
            </div>
          );
        })}
      </div>

      <TypingLine names={typing.map(nameOf)} />

      <form className="chat-form" onSubmit={submit}>
        <input
          className="field"
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onBlur={stopTyping}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={200}
          aria-label="Message"
          autoComplete="off"
        />
        <button className="btn" type="submit" disabled={disabled || draft.trim().length === 0}>
          Send
        </button>
      </form>
    </div>
  );
}

function TypingLine({ names }: { names: string[] }) {
  if (names.length === 0) return <div className="typing-line" aria-hidden="true" />;

  const who =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`;

  return (
    <div className="typing-line is-active" aria-live="polite">
      <span className="typing-dots">
        <i />
        <i />
        <i />
      </span>
      {who}
    </div>
  );
}
