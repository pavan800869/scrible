interface AvatarProps {
  name: string;
  seed: string;
  large?: boolean;
  speaking?: boolean;
  muted?: boolean;
}

/** Deterministic hue from the seed, so a player looks the same to everyone. */
function hueFrom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
}

export function Avatar({ name, seed, large, speaking, muted }: AvatarProps) {
  const hue = hueFrom(seed);
  const classes = ['avatar'];
  if (large === true) classes.push('avatar-lg');
  if (speaking === true) classes.push('is-speaking');
  if (muted === true) classes.push('is-muted');

  return (
    <div
      className={classes.join(' ')}
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 62% 52%), hsl(${(hue + 38) % 360} 58% 38%))`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
