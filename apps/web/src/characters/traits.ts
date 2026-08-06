/**
 * Every player is a little creature.
 *
 * Rather than draw dozens of one-off characters, a creature is assembled from
 * a body, a topper, and a palette, picked deterministically from the seed. The
 * combinations run into the thousands, everyone sees the same creature for the
 * same player, and each one still reads as a specific little guy.
 */

export type Mood = 'idle' | 'thinking' | 'happy' | 'drawing' | 'sad' | 'winner';

export type BodyShape = 'blob' | 'round' | 'egg' | 'pill' | 'drop' | 'cloud' | 'star' | 'brick';
export type Topper = 'none' | 'antenna' | 'horn' | 'ears' | 'tuft' | 'halo' | 'fin' | 'bolt';

export interface Palette {
  body: string;
  shade: string;
  accent: string;
}

export interface Creature {
  body: BodyShape;
  topper: Topper;
  palette: Palette;
  species: string;
  /** Small per-creature timing offset so a crowd never bobs in lockstep. */
  phase: number;
}

const BODIES: BodyShape[] = ['blob', 'round', 'egg', 'pill', 'drop', 'cloud', 'star', 'brick'];
const TOPPERS: Topper[] = ['none', 'antenna', 'horn', 'ears', 'tuft', 'halo', 'fin', 'bolt'];

const PALETTES: Palette[] = [
  { body: '#FF8A5B', shade: '#E5613A', accent: '#FFD9C2' },
  { body: '#4ECDC4', shade: '#2FA39B', accent: '#D6FFFB' },
  { body: '#FFD166', shade: '#E0A93C', accent: '#FFF4D6' },
  { body: '#A78BFA', shade: '#7C5CE0', accent: '#EDE6FF' },
  { body: '#7BD88F', shade: '#4FAE66', accent: '#DFFBE6' },
  { body: '#FF6B9D', shade: '#DB4477', accent: '#FFDCE8' },
  { body: '#5BA8FF', shade: '#3579D6', accent: '#DCEBFF' },
  { body: '#F97068', shade: '#D04840', accent: '#FFDEDB' },
  { body: '#54D1DB', shade: '#2BA5AF', accent: '#D9FAFC' },
  { body: '#C2E812', shade: '#95B300', accent: '#F2FFC2' },
  { body: '#FFA69E', shade: '#DB7A72', accent: '#FFE6E3' },
  { body: '#B8B3E9', shade: '#8983C7', accent: '#EFEDFF' },
];

/** Nonsense names, but they stick — people start calling each other these. */
const SPECIES = [
  'Blip', 'Nub', 'Wug', 'Fen', 'Mop', 'Zib', 'Tor', 'Kip',
  'Vex', 'Gob', 'Pud', 'Yolk', 'Snid', 'Bram', 'Oot', 'Lurk',
];

function hash(seed: string): number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function creatureFrom(seed: string): Creature {
  const base = hash(seed);
  const pick = <T>(list: readonly T[], shift: number): T =>
    list[Math.floor(base / 7 ** shift) % list.length] as T;

  return {
    body: pick(BODIES, 0),
    topper: pick(TOPPERS, 1),
    palette: pick(PALETTES, 2),
    species: pick(SPECIES, 3),
    phase: (base % 1000) / 1000,
  };
}

/** How many distinct creatures exist. Shown on the home screen as a nudge to reroll. */
export const CREATURE_COUNT = BODIES.length * TOPPERS.length * PALETTES.length;
