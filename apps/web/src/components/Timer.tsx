import { useEffect, useState } from 'react';

interface TimerProps {
  endsAt: number;
  totalMs: number;
  paused: boolean;
}

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function Timer({ endsAt, totalMs, paused }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [paused]);

  const remainingMs = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;
  const urgent = remainingMs <= 10_000 && remainingMs > 0;

  return (
    <div
      className={`timer${urgent ? ' is-urgent' : ''}`}
      role="timer"
      aria-label={`${seconds} seconds left`}
    >
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle className="timer-track" cx="23" cy="23" r={RADIUS} />
        <circle
          className="timer-bar"
          cx="23"
          cy="23"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span className="timer-value">{seconds}</span>
    </div>
  );
}
