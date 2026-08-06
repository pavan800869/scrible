import { creatureFrom, type BodyShape, type Mood, type Palette, type Topper } from '../characters/traits.js';

interface CharacterProps {
  seed: string;
  mood?: Mood;
  size?: number;
  speaking?: boolean;
  away?: boolean;
  /** Suppresses the idle bob — useful in dense lists. */
  still?: boolean;
}

export function Character({
  seed,
  mood = 'idle',
  size = 44,
  speaking = false,
  away = false,
  still = false,
}: CharacterProps) {
  const creature = creatureFrom(seed);
  const { palette } = creature;

  const classes = ['creature'];
  if (speaking) classes.push('is-speaking');
  if (away) classes.push('is-away');
  if (!still) classes.push('is-bobbing');
  if (mood === 'happy' || mood === 'winner') classes.push('is-celebrating');

  return (
    <span
      className={classes.join(' ')}
      style={{ width: size, height: size, animationDelay: `${creature.phase * -2}s` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <ellipse cx="50" cy="92" rx="26" ry="4" fill="rgba(0,0,0,0.28)" />
        <Feet palette={palette} />
        <Topper kind={creature.topper} palette={palette} />
        <Body shape={creature.body} palette={palette} />
        <Face mood={mood} />
      </svg>
    </span>
  );
}

function Body({ shape, palette }: { shape: BodyShape; palette: Palette }) {
  const fill = palette.body;
  const shade = palette.shade;

  const common = { fill, stroke: shade, strokeWidth: 3, strokeLinejoin: 'round' as const };

  switch (shape) {
    case 'round':
      return <circle cx="50" cy="54" r="32" {...common} />;
    case 'egg':
      return <ellipse cx="50" cy="54" rx="27" ry="34" {...common} />;
    case 'pill':
      return <rect x="16" y="30" width="68" height="50" rx="25" {...common} />;
    case 'brick':
      return <rect x="20" y="26" width="60" height="56" rx="14" {...common} />;
    case 'drop':
      return <path d="M50 18 C70 44 80 58 80 66 a30 30 0 0 1-60 0 c0-8 10-22 30-48Z" {...common} />;
    case 'cloud':
      return (
        <path
          d="M28 44a16 16 0 0 1 16-16 18 18 0 0 1 30 6 15 15 0 0 1 6 26 20 20 0 0 1-16 26H40a18 18 0 0 1-12-42Z"
          {...common}
        />
      );
    case 'star':
      return (
        <path
          d="M50 18 60 36 80 32 74 52 88 66 70 74 68 90 50 82 32 90 30 74 12 66 26 52 20 32 40 36Z"
          {...common}
        />
      );
    case 'blob':
    default:
      return (
        <path
          d="M50 20c20 0 32 12 32 30 0 22-12 34-32 34S18 72 18 50c0-18 12-30 32-30Z"
          {...common}
        />
      );
  }
}

function Feet({ palette }: { palette: Palette }) {
  return (
    <>
      <ellipse cx="38" cy="86" rx="9" ry="6" fill={palette.shade} />
      <ellipse cx="62" cy="86" rx="9" ry="6" fill={palette.shade} />
    </>
  );
}

function Topper({ kind, palette }: { kind: Topper; palette: Palette }) {
  const stroke = palette.shade;

  switch (kind) {
    case 'antenna':
      return (
        <g>
          <line x1="50" y1="24" x2="50" y2="8" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="7" r="6" fill={palette.accent} stroke={stroke} strokeWidth="3" />
        </g>
      );
    case 'horn':
      return <path d="M50 6 60 26H40Z" fill={palette.accent} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />;
    case 'ears':
      return (
        <g fill={palette.body} stroke={stroke} strokeWidth="3" strokeLinejoin="round">
          <path d="M26 30 22 6 44 20Z" />
          <path d="M74 30 78 6 56 20Z" />
        </g>
      );
    case 'tuft':
      return (
        <g stroke={stroke} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M42 24 36 8" />
          <path d="M50 22 50 4" />
          <path d="M58 24 64 8" />
        </g>
      );
    case 'halo':
      return <ellipse cx="50" cy="10" rx="20" ry="6" fill="none" stroke={palette.accent} strokeWidth="4" />;
    case 'fin':
      return <path d="M34 22 Q50 -4 66 22Z" fill={palette.accent} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />;
    case 'bolt':
      return <path d="M52 4 38 26h12l-6 18 22-26H52l6-14Z" fill={palette.accent} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />;
    case 'none':
    default:
      return null;
  }
}

const INK = '#1B1D21';

function Face({ mood }: { mood: Mood }) {
  return (
    <g>
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      {mood === 'thinking' && (
        <path d="M78 40c3 5 5 8 5 10a5 5 0 0 1-10 0c0-2 2-5 5-10Z" fill="#7FD1E8" opacity="0.9" />
      )}
      {mood === 'winner' && (
        <path
          d="M30 20 38 30 50 14 62 30 70 20 66 38H34Z"
          fill="#FFD166"
          stroke="#E0A93C"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  const stroke = { stroke: INK, strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };

  switch (mood) {
    case 'happy':
      return (
        <g {...stroke}>
          <path d="M32 52q6-8 12 0" />
          <path d="M56 52q6-8 12 0" />
        </g>
      );
    case 'winner':
      return (
        <g fill={INK}>
          <path d="M38 44 41 51 48 52 43 57 44 64 38 60 32 64 33 57 28 52 35 51Z" />
          <path d="M62 44 65 51 72 52 67 57 68 64 62 60 56 64 57 57 52 52 59 51Z" />
        </g>
      );
    case 'sad':
      return (
        <g {...stroke}>
          <path d="M32 54q6 6 12 0" />
          <path d="M56 54q6 6 12 0" />
        </g>
      );
    case 'thinking':
      return (
        <g>
          <circle cx="38" cy="52" r="5" fill={INK} />
          <path d="M56 52h12" {...stroke} />
        </g>
      );
    case 'drawing':
      return (
        <g fill={INK}>
          <ellipse cx="38" cy="52" rx="4" ry="6" />
          <ellipse cx="62" cy="52" rx="4" ry="6" />
        </g>
      );
    case 'idle':
    default:
      return (
        <g fill={INK}>
          <circle cx="38" cy="52" r="5" />
          <circle cx="62" cy="52" r="5" />
          <circle cx="39.5" cy="50" r="1.8" fill="#fff" />
          <circle cx="63.5" cy="50" r="1.8" fill="#fff" />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'happy':
    case 'winner':
      return (
        <g>
          <path d="M38 64q12 14 24 0Z" fill={INK} />
          <path d="M45 71q5 5 10 0Z" fill="#FF6B9D" />
        </g>
      );
    case 'sad':
      return <path d="M40 72q10-10 20 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case 'thinking':
      return <path d="M40 68q5-4 10 0t10 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case 'drawing':
      return (
        <g>
          <path d="M42 66h16" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M54 66q6 2 4 8t-8 0Z" fill="#FF6B9D" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'idle':
    default:
      return <path d="M42 66q8 7 16 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
  }
}
