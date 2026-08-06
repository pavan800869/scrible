# scrible Core Engine & Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a headless but fully playable multiplayer drawing-and-guessing game server — pure game logic plus a WebSocket server — verified end to end by integration tests that drive a complete two-player game.

**Architecture:** All game rules live in a pure, dependency-free `packages/protocol` as a reducer `(state, event, ctx) → { state, effects }`. The reducer never touches the clock, the network, or randomness directly — `ctx` injects `now` and `random`, which makes the entire game deterministic under test. `apps/server` is a thin shell: it drives the reducer from a 250 ms tick, executes the declarative effects the reducer returns, and owns sockets. The server is the sole authority and never sends the secret word to a guesser.

**Tech Stack:** TypeScript 5.7, Node 22, pnpm workspaces, Fastify 5, `ws` 8, zod 3, Vitest 2, `tsx` for dev.

## Global Constraints

- Node 22 LTS. pnpm 9+. TypeScript strict mode on, `noUncheckedIndexedAccess` on.
- ESM everywhere. Every `package.json` sets `"type": "module"`.
- `packages/protocol` has **zero runtime dependencies except zod**. No Node built-ins, no timers, no `Math.random`, no `Date.now`. This is what makes it testable and is non-negotiable.
- The secret word is **never** serialized to a player who has not guessed it. Every outbound state payload goes through `redactStateFor()`. There is no exception, including for spectators and the "close guess" path.
- Word list content must be original. Do not copy word data from any existing game.
- Logical canvas is fixed at 1000×600 for all coordinate math.
- Commit after every task. Conventional Commits format (`feat:`, `test:`, `chore:`).

---

## File Structure

```
scrible/
├── package.json                       workspace root, scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json                 shared compiler options
├── packages/
│   ├── protocol/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts               public barrel
│   │   │   ├── types.ts               Player, RoomSettings, Phase, RoomState
│   │   │   ├── messages.ts            zod schemas for client↔server frames
│   │   │   ├── events.ts              GameEvent + Effect unions
│   │   │   ├── text.ts                normalize(), levenshteinAtMost()
│   │   │   ├── guess.ts               classifyGuess()
│   │   │   ├── score.ts               guesserScore(), drawerScore()
│   │   │   ├── hints.ts               buildHintSchedule(), applyReveals()
│   │   │   ├── reduce.ts              the state machine
│   │   │   └── redact.ts              redactStateFor()
│   │   └── test/                      one spec file per source module
│   └── words/
│       ├── package.json
│       └── src/
│           ├── index.ts               pickWords(), WordEntry
│           └── list.ts                original word data
└── apps/
    └── server/
        ├── package.json
        └── src/
            ├── index.ts               entrypoint, wiring
            ├── http.ts                Fastify app: health, create-room
            ├── rooms/
            │   ├── store.ts           RoomStore interface + memory impl
            │   └── room.ts            reducer driver, tick loop, effect executor
            ├── net/
            │   ├── connection.ts      per-socket lifecycle, validation, rate limit
            │   ├── ratelimit.ts       token bucket
            │   └── strokes.ts         StrokeRelay + replay log
            └── test/
                ├── unit/
                └── integration/
```

Rationale for the split: `text`, `guess`, `score`, and `hints` are each pure and independently meaningful, so each gets its own file and its own test cycle. `reduce.ts` is the one file that will grow large; it is kept free of every concern the other files already own, so it contains only transition logic.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/protocol/package.json`, `packages/protocol/tsconfig.json`, `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `pnpm -r test` command; the `@scrible/protocol` package name that every later task imports

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index.js';

describe('protocol package', () => {
  it('exposes a protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test`
Expected: FAIL — the package does not exist yet, so pnpm errors before Vitest runs.

- [ ] **Step 3: Create the workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`package.json`:
```json
{
  "name": "scrible",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "isolatedModules": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
.DS_Store
```

`packages/protocol/package.json`:
```json
{
  "name": "@scrible/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.24.1" },
  "devDependencies": { "vitest": "^2.1.8", "typescript": "^5.7.2" }
}
```

`packages/protocol/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/protocol/src/index.ts`:
```ts
export const PROTOCOL_VERSION = 1;
```

- [ ] **Step 4: Install and run the test**

Run: `pnpm install && pnpm -C packages/protocol test`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore packages/
git commit -m "chore: scaffold pnpm workspace with protocol package"
```

---

### Task 2: Text normalization and bounded edit distance

**Files:**
- Create: `packages/protocol/src/text.ts`
- Test: `packages/protocol/test/text.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalize(input: string): string`
  - `levenshteinAtMost(a: string, b: string, max: number): number | null` — returns the distance, or `null` when it provably exceeds `max`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { levenshteinAtMost, normalize } from '../src/text.js';

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Apple ')).toBe('apple');
  });

  it('collapses internal whitespace', () => {
    expect(normalize('ice   cream')).toBe('ice cream');
  });

  it('strips diacritics', () => {
    expect(normalize('café')).toBe('cafe');
  });

  it('removes punctuation but keeps spaces', () => {
    expect(normalize("jack-o'-lantern")).toBe('jackolantern');
  });
});

describe('levenshteinAtMost', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinAtMost('apple', 'apple', 2)).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshteinAtMost('apple', 'apply', 2)).toBe(1);
  });

  it('counts a single deletion', () => {
    expect(levenshteinAtMost('aple', 'apple', 2)).toBe(1);
  });

  it('returns null when the distance exceeds max', () => {
    expect(levenshteinAtMost('apple', 'orange', 2)).toBeNull();
  });

  it('short-circuits on a large length difference', () => {
    expect(levenshteinAtMost('a', 'abcdefghij', 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test text`
Expected: FAIL — `Failed to resolve import "../src/text.js"`.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/text.ts`:
```ts
/** Casefold, strip accents and punctuation, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Edit distance, abandoned as soon as it is known to exceed `max`.
 * Returns the distance, or null when it exceeds `max`.
 */
export function levenshteinAtMost(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  if (a === b) return 0;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return null;
    [prev, curr] = [curr, prev];
  }

  const distance = prev[b.length] ?? Number.POSITIVE_INFINITY;
  return distance > max ? null : distance;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test text`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/text.ts packages/protocol/test/text.test.ts
git commit -m "feat: add text normalization and bounded edit distance"
```

---

### Task 3: Guess classification

**Files:**
- Create: `packages/protocol/src/guess.ts`
- Test: `packages/protocol/test/guess.test.ts`

**Interfaces:**
- Consumes: `normalize`, `levenshteinAtMost` from `./text.js`
- Produces: `classifyGuess(guess: string, word: string): GuessResult` where `type GuessResult = 'correct' | 'close' | 'wrong'`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/guess.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyGuess } from '../src/guess.js';

describe('classifyGuess', () => {
  it('accepts an exact match', () => {
    expect(classifyGuess('apple', 'apple')).toBe('correct');
  });

  it('accepts a match differing only in case and spacing', () => {
    expect(classifyGuess('  Ice  Cream ', 'ice cream')).toBe('correct');
  });

  it('flags a one-letter typo as close', () => {
    expect(classifyGuess('aple', 'apple')).toBe('close');
  });

  it('flags a two-letter typo as close', () => {
    expect(classifyGuess('aplle', 'apple')).toBe('close');
  });

  it('rejects an unrelated word', () => {
    expect(classifyGuess('orange', 'apple')).toBe('wrong');
  });

  it('does not call a short word close on a large relative error', () => {
    expect(classifyGuess('go', 'cat')).toBe('wrong');
  });

  it('rejects an empty guess', () => {
    expect(classifyGuess('   ', 'apple')).toBe('wrong');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test guess`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/guess.ts`:
```ts
import { levenshteinAtMost, normalize } from './text.js';

export type GuessResult = 'correct' | 'close' | 'wrong';

/**
 * Words shorter than this are never reported as "close" — on a 3-letter
 * word a distance of 2 is a different word, not a typo.
 */
const MIN_LENGTH_FOR_CLOSE = 4;

export function classifyGuess(guess: string, word: string): GuessResult {
  const g = normalize(guess);
  const w = normalize(word);
  if (g.length === 0) return 'wrong';
  if (g === w) return 'correct';
  if (w.length < MIN_LENGTH_FOR_CLOSE) return 'wrong';

  const distance = levenshteinAtMost(g, w, 2);
  return distance !== null ? 'close' : 'wrong';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test guess`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/guess.ts packages/protocol/test/guess.test.ts
git commit -m "feat: add guess classification with close-match detection"
```

---

### Task 4: Scoring

**Files:**
- Create: `packages/protocol/src/score.ts`
- Test: `packages/protocol/test/score.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Difficulty = 'easy' | 'medium' | 'hard'`
  - `guesserScore(input: { timeRemainingMs: number; drawTimeMs: number; difficulty: Difficulty }): number`
  - `drawerScore(input: { guesserScores: number[]; otherPlayerCount: number }): number`
  - `const DRAWER_SCORE_CAP = 350`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/score.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DRAWER_SCORE_CAP, drawerScore, guesserScore } from '../src/score.js';

describe('guesserScore', () => {
  it('awards the maximum when no time has elapsed', () => {
    expect(guesserScore({ timeRemainingMs: 80_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(400);
  });

  it('awards the floor when time has run out', () => {
    expect(guesserScore({ timeRemainingMs: 0, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(100);
  });

  it('scales linearly at the halfway point', () => {
    expect(guesserScore({ timeRemainingMs: 40_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(250);
  });

  it('applies the hard-word multiplier', () => {
    expect(guesserScore({ timeRemainingMs: 80_000, drawTimeMs: 80_000, difficulty: 'hard' })).toBe(520);
  });

  it('clamps negative remaining time to zero', () => {
    expect(guesserScore({ timeRemainingMs: -5_000, drawTimeMs: 80_000, difficulty: 'easy' })).toBe(100);
  });
});

describe('drawerScore', () => {
  it('scores zero when nobody guessed', () => {
    expect(drawerScore({ guesserScores: [], otherPlayerCount: 3 })).toBe(0);
  });

  it('scores the full mean when everyone guessed', () => {
    expect(drawerScore({ guesserScores: [200, 300], otherPlayerCount: 2 })).toBe(250);
  });

  it('scales down when only some guessed', () => {
    expect(drawerScore({ guesserScores: [200], otherPlayerCount: 4 })).toBe(50);
  });

  it('caps the drawer score', () => {
    expect(drawerScore({ guesserScores: [520, 520], otherPlayerCount: 2 })).toBe(DRAWER_SCORE_CAP);
  });

  it('scores zero when there are no other players', () => {
    expect(drawerScore({ guesserScores: [], otherPlayerCount: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test score`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/score.ts`:
```ts
export type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.15,
  hard: 1.3,
};

const GUESS_BASE = 100;
const GUESS_TIME_BONUS = 300;
export const DRAWER_SCORE_CAP = 350;

export function guesserScore(input: {
  timeRemainingMs: number;
  drawTimeMs: number;
  difficulty: Difficulty;
}): number {
  const { drawTimeMs, difficulty } = input;
  if (drawTimeMs <= 0) return 0;
  const remaining = Math.max(0, Math.min(input.timeRemainingMs, drawTimeMs));
  const raw = GUESS_BASE + Math.floor((GUESS_TIME_BONUS * remaining) / drawTimeMs);
  return Math.floor(raw * DIFFICULTY_MULTIPLIER[difficulty]);
}

export function drawerScore(input: {
  guesserScores: number[];
  otherPlayerCount: number;
}): number {
  const { guesserScores, otherPlayerCount } = input;
  if (otherPlayerCount <= 0 || guesserScores.length === 0) return 0;

  const mean = guesserScores.reduce((sum, n) => sum + n, 0) / guesserScores.length;
  const guessedFraction = Math.min(1, guesserScores.length / otherPlayerCount);
  return Math.min(DRAWER_SCORE_CAP, Math.floor(mean * guessedFraction));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test score`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/score.ts packages/protocol/test/score.test.ts
git commit -m "feat: add guesser and drawer scoring"
```

---

### Task 5: Hint scheduling and word masking

**Files:**
- Create: `packages/protocol/src/hints.ts`
- Test: `packages/protocol/test/hints.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type MaskCell = { kind: 'space' } | { kind: 'letter'; char: string | null }`
  - `buildMask(word: string, revealed: ReadonlySet<number>, mode: GameModeName): MaskCell[]` where `GameModeName = 'normal' | 'hidden' | 'combination'`
  - `buildHintSchedule(input: { word: string; hints: number; drawTimeMs: number; mode: GameModeName; random: () => number }): HintReveal[]` where `HintReveal = { atElapsedMs: number; index: number }`

Hidden mode returns an empty schedule and a mask whose letter cells are always `null`, so length is visible but no letter ever is.

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/hints.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildHintSchedule, buildMask } from '../src/hints.js';

const fixedRandom = () => 0.42;

describe('buildMask', () => {
  it('masks every letter when nothing is revealed', () => {
    expect(buildMask('cat', new Set(), 'normal')).toEqual([
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
    ]);
  });

  it('marks spaces distinctly so word breaks are visible', () => {
    const mask = buildMask('ice cream', new Set(), 'normal');
    expect(mask[3]).toEqual({ kind: 'space' });
    expect(mask).toHaveLength(9);
  });

  it('reveals the requested indices', () => {
    const mask = buildMask('cat', new Set([0]), 'normal');
    expect(mask[0]).toEqual({ kind: 'letter', char: 'c' });
    expect(mask[1]).toEqual({ kind: 'letter', char: null });
  });

  it('never reveals a letter in hidden mode', () => {
    const mask = buildMask('cat', new Set([0, 1, 2]), 'hidden');
    expect(mask.every((cell) => cell.kind === 'space' || cell.char === null)).toBe(true);
  });
});

describe('buildHintSchedule', () => {
  it('returns nothing when hints are disabled', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 0, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toEqual([]);
  });

  it('returns nothing in hidden mode even when hints are configured', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'hidden', random: fixedRandom,
    });
    expect(schedule).toEqual([]);
  });

  it('never reveals more than half the letters', () => {
    const schedule = buildHintSchedule({
      word: 'cat', hints: 5, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toHaveLength(1);
  });

  it('reveals distinct indices in increasing time order', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    expect(schedule).toHaveLength(3);
    expect(new Set(schedule.map((r) => r.index)).size).toBe(3);
    const times = schedule.map((r) => r.atElapsedMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('places every reveal inside the drawing window', () => {
    const schedule = buildHintSchedule({
      word: 'elephant', hints: 3, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    for (const reveal of schedule) {
      expect(reveal.atElapsedMs).toBeGreaterThan(0);
      expect(reveal.atElapsedMs).toBeLessThan(80_000);
    }
  });

  it('never schedules a reveal on a space', () => {
    const schedule = buildHintSchedule({
      word: 'ice cream', hints: 4, drawTimeMs: 80_000, mode: 'normal', random: fixedRandom,
    });
    for (const reveal of schedule) {
      expect('ice cream'[reveal.index]).not.toBe(' ');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test hints`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/hints.ts`:
```ts
export type GameModeName = 'normal' | 'hidden' | 'combination';

export type MaskCell = { kind: 'space' } | { kind: 'letter'; char: string | null };

export interface HintReveal {
  atElapsedMs: number;
  index: number;
}

/** Reveals are spread across this slice of the drawing window. */
const REVEAL_WINDOW_START = 0.4;
const REVEAL_WINDOW_END = 0.85;

export function buildMask(
  word: string,
  revealed: ReadonlySet<number>,
  mode: GameModeName,
): MaskCell[] {
  return [...word].map((char, index) => {
    if (char === ' ') return { kind: 'space' };
    if (mode === 'hidden') return { kind: 'letter', char: null };
    return { kind: 'letter', char: revealed.has(index) ? char : null };
  });
}

export function buildHintSchedule(input: {
  word: string;
  hints: number;
  drawTimeMs: number;
  mode: GameModeName;
  random: () => number;
}): HintReveal[] {
  const { word, hints, drawTimeMs, mode, random } = input;
  if (mode === 'hidden' || hints <= 0) return [];

  const letterIndices = [...word]
    .map((char, index) => (char === ' ' ? -1 : index))
    .filter((index) => index >= 0);

  const count = Math.min(hints, Math.floor(letterIndices.length / 2));
  if (count <= 0) return [];

  const shuffled = shuffle(letterIndices, random);
  const chosen = shuffled.slice(0, count);

  const start = drawTimeMs * REVEAL_WINDOW_START;
  const end = drawTimeMs * REVEAL_WINDOW_END;
  const step = count === 1 ? 0 : (end - start) / (count - 1);

  return chosen
    .map((index, i) => ({ index, atElapsedMs: Math.round(start + step * i) }))
    .sort((a, b) => a.atElapsedMs - b.atElapsedMs);
}

/** Fisher-Yates using the injected random source, so tests stay deterministic. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test hints`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/hints.ts packages/protocol/test/hints.test.ts
git commit -m "feat: add hint scheduling and word masking"
```

---

### Task 6: Core types and settings validation

**Files:**
- Create: `packages/protocol/src/types.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/types.test.ts`

**Interfaces:**
- Consumes: `Difficulty` from `./score.js`, `GameModeName` and `MaskCell` from `./hints.js`
- Produces: `Player`, `RoomSettings`, `Phase`, `RoomState`, `DRAW_TIME_STEPS`, `DEFAULT_SETTINGS`, `roomSettingsSchema`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/types.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DRAW_TIME_STEPS, roomSettingsSchema } from '../src/types.js';

describe('roomSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(roomSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects a draw time outside the allowed steps', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, drawTimeSec: 77 });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than two players', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxPlayers: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects more than twenty players', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxPlayers: 21 });
    expect(result.success).toBe(false);
  });

  it('rejects more than five hints', () => {
    const result = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, hints: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects customWordsOnly with an empty custom list', () => {
    const result = roomSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS, customWordsOnly: true, customWords: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts customWordsOnly with enough custom words', () => {
    const result = roomSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      customWordsOnly: true,
      customWords: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'],
    });
    expect(result.success).toBe(true);
  });
});

describe('DRAW_TIME_STEPS', () => {
  it('spans the documented range', () => {
    expect(DRAW_TIME_STEPS[0]).toBe(15);
    expect(DRAW_TIME_STEPS.at(-1)).toBe(240);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test types`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/types.ts`:
```ts
import { z } from 'zod';
import type { Difficulty } from './score.js';
import type { GameModeName, MaskCell } from './hints.js';

export type PlayerId = string;
export type RoomId = string;

export interface Player {
  id: PlayerId;
  name: string;
  avatarSeed: string;
  score: number;
  connected: boolean;
  /** Wall-clock ms at which a disconnected player's seat expires. */
  seatExpiresAt: number | null;
  joinedAt: number;
  /** Server-side only. Stripped by redactStateFor — never sent to a client. */
  ip: string;
}

export const DRAW_TIME_STEPS = [
  15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240,
] as const;

/** customWordsOnly needs enough words to fill several turns without repeats. */
export const MIN_CUSTOM_WORDS = 5;

export const roomSettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(20),
    rounds: z.number().int().min(2).max(10),
    drawTimeSec: z.number().int().refine((n) => (DRAW_TIME_STEPS as readonly number[]).includes(n), {
      message: 'drawTimeSec must be one of the allowed steps',
    }),
    wordChoices: z.number().int().min(1).max(5),
    hints: z.number().int().min(0).max(5),
    mode: z.enum(['normal', 'hidden', 'combination']),
    customWords: z.array(z.string().min(1).max(40)).max(500),
    customWordsOnly: z.boolean(),
  })
  .refine((s) => !s.customWordsOnly || s.customWords.length >= MIN_CUSTOM_WORDS, {
    message: `customWordsOnly requires at least ${MIN_CUSTOM_WORDS} custom words`,
    path: ['customWords'],
  });

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 12,
  rounds: 3,
  drawTimeSec: 80,
  wordChoices: 3,
  hints: 2,
  mode: 'normal',
  customWords: [],
  customWordsOnly: false,
};

export interface TurnWord {
  text: string;
  difficulty: Difficulty;
}

export type Phase =
  | { name: 'lobby' }
  | { name: 'word-select'; drawerId: PlayerId; choices: TurnWord[]; endsAt: number }
  | {
      name: 'drawing';
      drawerId: PlayerId;
      word: TurnWord;
      startedAt: number;
      endsAt: number;
      revealed: number[];
      schedule: { atElapsedMs: number; index: number }[];
      correct: { playerId: PlayerId; atMs: number; points: number }[];
    }
  | { name: 'turn-end'; word: string; deltas: Record<PlayerId, number>; endsAt: number }
  | { name: 'round-end'; endsAt: number }
  | { name: 'game-end' };

export interface RoomState {
  id: RoomId;
  hostId: PlayerId | null;
  settings: RoomSettings;
  players: Player[];
  /** Player IDs in this round's drawing order. */
  turnOrder: PlayerId[];
  turnIndex: number;
  round: number;
  phase: Phase;
  usedWords: string[];
  bans: { playerId: PlayerId; ip: string }[];
}

/** The redacted view a client receives. Never contains the secret word. */
export interface ClientPhaseView {
  name: Phase['name'];
  drawerId?: PlayerId;
  endsAt?: number;
  /** Present only for the drawer during word-select. */
  choices?: TurnWord[];
  /** Present during drawing; the drawer and correct guessers see real letters. */
  mask?: MaskCell[];
  /** Present at turn-end, when the word is public. */
  word?: string;
  deltas?: Record<PlayerId, number>;
  correctPlayerIds?: PlayerId[];
}

export type GameMode = GameModeName;
```

`packages/protocol/src/index.ts`:
```ts
export const PROTOCOL_VERSION = 1;

export * from './types.js';
export * from './text.js';
export * from './guess.js';
export * from './score.js';
export * from './hints.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src packages/protocol/test/types.test.ts
git commit -m "feat: add core game types and settings validation"
```

---

### Task 7: State redaction

**Files:**
- Create: `packages/protocol/src/redact.ts`
- Modify: `packages/protocol/src/index.ts` (add `export * from './redact.js';`)
- Test: `packages/protocol/test/redact.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `ClientPhaseView`, `PlayerId` from `./types.js`; `buildMask` from `./hints.js`
- Produces: `redactStateFor(state: RoomState, viewerId: PlayerId): ClientRoomView`

This is the single most security-relevant function in the codebase. Every outbound state payload goes through it.

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/redact.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { redactStateFor } from '../src/redact.js';

function drawingState(): RoomState {
  return {
    id: 'room1',
    hostId: 'p1',
    settings: DEFAULT_SETTINGS,
    players: [
      { id: 'p1', name: 'Ada', avatarSeed: 'a', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '1.1.1.1' },
      { id: 'p2', name: 'Bo', avatarSeed: 'b', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '2.2.2.2' },
      { id: 'p3', name: 'Cy', avatarSeed: 'c', score: 0, connected: true, seatExpiresAt: null, joinedAt: 0, ip: '3.3.3.3' },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    turnIndex: 0,
    round: 1,
    phase: {
      name: 'drawing',
      drawerId: 'p1',
      word: { text: 'apple', difficulty: 'easy' },
      startedAt: 0,
      endsAt: 80_000,
      revealed: [0],
      schedule: [],
      correct: [{ playerId: 'p2', atMs: 10_000, points: 300 }],
    },
    usedWords: [],
    bans: [],
  };
}

describe('redactStateFor', () => {
  it('never includes the raw word anywhere in a guesser view', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(JSON.stringify(view)).not.toContain('apple');
  });

  it('gives the drawer the full word', () => {
    const view = redactStateFor(drawingState(), 'p1');
    expect(view.phase.word).toBe('apple');
  });

  it('gives a correct guesser the full word', () => {
    const view = redactStateFor(drawingState(), 'p2');
    expect(view.phase.word).toBe('apple');
  });

  it('gives a guesser a mask with only revealed letters', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(view.phase.mask).toEqual([
      { kind: 'letter', char: 'a' },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
      { kind: 'letter', char: null },
    ]);
  });

  it('reports who has guessed without leaking their guesses', () => {
    const view = redactStateFor(drawingState(), 'p3');
    expect(view.phase.correctPlayerIds).toEqual(['p2']);
  });

  it('hides word choices from everyone but the drawer', () => {
    const state = drawingState();
    state.phase = {
      name: 'word-select', drawerId: 'p1', endsAt: 15_000,
      choices: [{ text: 'apple', difficulty: 'easy' }],
    };
    expect(JSON.stringify(redactStateFor(state, 'p2'))).not.toContain('apple');
    expect(redactStateFor(state, 'p1').phase.choices).toHaveLength(1);
  });

  it('reveals the word to everyone at turn-end', () => {
    const state = drawingState();
    state.phase = { name: 'turn-end', word: 'apple', deltas: { p2: 300 }, endsAt: 6_000 };
    expect(redactStateFor(state, 'p3').phase.word).toBe('apple');
  });

  it('omits ban records from every client view', () => {
    const state = drawingState();
    state.bans = [{ playerId: 'p9', ip: '10.0.0.1' }];
    expect(JSON.stringify(redactStateFor(state, 'p1'))).not.toContain('10.0.0.1');
  });

  it('never exposes a player IP', () => {
    expect(JSON.stringify(redactStateFor(drawingState(), 'p1'))).not.toContain('2.2.2.2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test redact`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/redact.ts`:
```ts
import { buildMask } from './hints.js';
import type { ClientPhaseView, Player, PlayerId, RoomSettings, RoomState } from './types.js';

/** A player as a client sees them — the server-only `ip` field is gone. */
export type PublicPlayer = Omit<Player, 'ip'>;

export interface ClientRoomView {
  id: string;
  hostId: PlayerId | null;
  settings: RoomSettings;
  players: PublicPlayer[];
  turnOrder: PlayerId[];
  turnIndex: number;
  round: number;
  phase: ClientPhaseView;
}

/**
 * Build the view a single player is allowed to see.
 *
 * The secret word is included ONLY for the drawer, for players who have
 * already guessed correctly, and once the word is public at turn-end.
 * Player IPs and ban records never leave the server.
 */
export function redactStateFor(state: RoomState, viewerId: PlayerId): ClientRoomView {
  return {
    id: state.id,
    hostId: state.hostId,
    settings: state.settings,
    players: state.players.map(({ ip: _ip, ...rest }) => rest),
    turnOrder: state.turnOrder,
    turnIndex: state.turnIndex,
    round: state.round,
    phase: redactPhase(state, viewerId),
  };
}

function redactPhase(state: RoomState, viewerId: PlayerId): ClientPhaseView {
  const phase = state.phase;

  switch (phase.name) {
    case 'lobby':
    case 'game-end':
      return { name: phase.name };

    case 'word-select':
      return {
        name: phase.name,
        drawerId: phase.drawerId,
        endsAt: phase.endsAt,
        ...(viewerId === phase.drawerId ? { choices: phase.choices } : {}),
      };

    case 'drawing': {
      const knowsWord =
        viewerId === phase.drawerId || phase.correct.some((c) => c.playerId === viewerId);

      return {
        name: phase.name,
        drawerId: phase.drawerId,
        endsAt: phase.endsAt,
        mask: buildMask(phase.word.text, new Set(phase.revealed), state.settings.mode),
        correctPlayerIds: phase.correct.map((c) => c.playerId),
        ...(knowsWord ? { word: phase.word.text } : {}),
      };
    }

    case 'turn-end':
      return {
        name: phase.name,
        word: phase.word,
        deltas: phase.deltas,
        endsAt: phase.endsAt,
      };

    case 'round-end':
      return { name: phase.name, endsAt: phase.endsAt };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test redact`
Expected: PASS, 8 tests.

Note the mask test expects a fully-masked word for a guesser even though `knowsWord` players also get `mask`. That is intentional: the mask is cheap and consistent, and the extra `word` field is what distinguishes the two views.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/redact.ts packages/protocol/src/index.ts packages/protocol/test/redact.test.ts
git commit -m "feat: add state redaction so guessers never receive the word"
```

---

### Task 8: Word list package

**Files:**
- Create: `packages/words/package.json`, `packages/words/tsconfig.json`
- Create: `packages/words/src/list.ts`, `packages/words/src/index.ts`
- Test: `packages/words/test/words.test.ts`

**Interfaces:**
- Consumes: `Difficulty` from `@scrible/protocol`
- Produces:
  - `interface WordEntry { text: string; difficulty: Difficulty; category: string }`
  - `pickWords(input: { count: number; exclude: readonly string[]; customWords: readonly string[]; customWordsOnly: boolean; mode: GameMode; random: () => number }): WordEntry[]`

Combination mode returns entries whose `text` is two words joined by a space, composed from two independent picks.

Write at least 300 original words spread across easy/medium/hard and across categories (animals, food, objects, actions, places, nature, sport, music, weather, transport). Do not copy word data from any existing game — write it fresh.

- [ ] **Step 1: Write the failing test**

`packages/words/test/words.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { WORDS, pickWords } from '../src/index.js';

const base = {
  exclude: [] as string[],
  customWords: [] as string[],
  customWordsOnly: false,
  mode: 'normal' as const,
  random: () => 0.42,
};

describe('WORDS', () => {
  it('has a substantial list', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(300);
  });

  it('contains no duplicates', () => {
    expect(new Set(WORDS.map((w) => w.text)).size).toBe(WORDS.length);
  });

  it('covers every difficulty', () => {
    const difficulties = new Set(WORDS.map((w) => w.difficulty));
    expect(difficulties).toEqual(new Set(['easy', 'medium', 'hard']));
  });

  it('has only lowercase words without leading or trailing space', () => {
    for (const word of WORDS) {
      expect(word.text).toBe(word.text.toLowerCase().trim());
    }
  });
});

describe('pickWords', () => {
  it('returns the requested count', () => {
    expect(pickWords({ ...base, count: 3 })).toHaveLength(3);
  });

  it('returns distinct words', () => {
    const picked = pickWords({ ...base, count: 5 });
    expect(new Set(picked.map((w) => w.text)).size).toBe(5);
  });

  it('honours the exclude list', () => {
    const first = pickWords({ ...base, count: 1 })[0]!;
    const second = pickWords({ ...base, count: 1, exclude: [first.text] })[0]!;
    expect(second.text).not.toBe(first.text);
  });

  it('uses only custom words when customWordsOnly is set', () => {
    const custom = ['zebra crossing', 'lava lamp', 'paper clip', 'tide pool', 'wind chime'];
    const picked = pickWords({ ...base, count: 3, customWords: custom, customWordsOnly: true });
    for (const word of picked) expect(custom).toContain(word.text);
  });

  it('rates custom words as medium', () => {
    const custom = ['zebra crossing', 'lava lamp', 'paper clip', 'tide pool', 'wind chime'];
    const picked = pickWords({ ...base, count: 1, customWords: custom, customWordsOnly: true });
    expect(picked[0]!.difficulty).toBe('medium');
  });

  it('returns two-word entries in combination mode', () => {
    const picked = pickWords({ ...base, count: 2, mode: 'combination' });
    for (const word of picked) expect(word.text.split(' ').length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to reusing words when the pool is exhausted', () => {
    const custom = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const picked = pickWords({
      ...base, count: 5, customWords: custom, customWordsOnly: true, exclude: custom,
    });
    expect(picked).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/words test`
Expected: FAIL — the package does not exist.

- [ ] **Step 3: Write the implementation**

`packages/words/package.json`:
```json
{
  "name": "@scrible/words",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@scrible/protocol": "workspace:*" },
  "devDependencies": { "vitest": "^2.1.8", "typescript": "^5.7.2" }
}
```

`packages/words/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/words/src/list.ts` — export `WORDS: WordEntry[]`. Write 300+ original entries, shaped like this:
```ts
import type { WordEntry } from './index.js';

export const WORDS: WordEntry[] = [
  { text: 'cat', difficulty: 'easy', category: 'animals' },
  { text: 'ladder', difficulty: 'easy', category: 'objects' },
  { text: 'lighthouse', difficulty: 'medium', category: 'places' },
  { text: 'avalanche', difficulty: 'hard', category: 'nature' },
  // …continue to at least 300 entries across all ten categories
];
```

`packages/words/src/index.ts`:
```ts
import type { Difficulty, GameMode } from '@scrible/protocol';
import { WORDS } from './list.js';

export { WORDS };

export interface WordEntry {
  text: string;
  difficulty: Difficulty;
  category: string;
}

export function pickWords(input: {
  count: number;
  exclude: readonly string[];
  customWords: readonly string[];
  customWordsOnly: boolean;
  mode: GameMode;
  random: () => number;
}): WordEntry[] {
  const { count, mode, random } = input;
  const perEntry = mode === 'combination' ? 2 : 1;
  const needed = count * perEntry;

  const pool = buildPool(input);
  const excluded = new Set(input.exclude);

  let candidates = pool.filter((w) => !excluded.has(w.text));
  // Exhausted pool: reuse rather than fail. A repeated word beats a stalled game.
  if (candidates.length < needed) candidates = pool;

  const drawn = drawDistinct(candidates, needed, random);

  if (mode !== 'combination') return drawn;

  return Array.from({ length: count }, (_, i) => {
    const a = drawn[i * 2] as WordEntry;
    const b = drawn[i * 2 + 1] as WordEntry;
    return {
      text: `${a.text} ${b.text}`,
      difficulty: 'hard' as Difficulty,
      category: `${a.category}+${b.category}`,
    };
  });
}

function buildPool(input: {
  customWords: readonly string[];
  customWordsOnly: boolean;
}): WordEntry[] {
  const custom: WordEntry[] = input.customWords.map((text) => ({
    text: text.toLowerCase().trim(),
    difficulty: 'medium',
    category: 'custom',
  }));

  if (input.customWordsOnly) return custom;
  return custom.length > 0 ? [...WORDS, ...custom] : WORDS;
}

function drawDistinct(pool: readonly WordEntry[], count: number, random: () => number): WordEntry[] {
  const taken = new Set<number>();
  const out: WordEntry[] = [];

  // Bounded attempts, then a linear sweep, so this can never spin forever.
  for (let attempt = 0; attempt < count * 20 && out.length < count; attempt++) {
    const index = Math.floor(random() * pool.length);
    if (taken.has(index)) continue;
    taken.add(index);
    out.push(pool[index] as WordEntry);
  }
  for (let i = 0; out.length < count && i < pool.length; i++) {
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(pool[i] as WordEntry);
  }
  // Pool smaller than count: pad by repeating.
  for (let i = 0; out.length < count; i++) {
    out.push(pool[i % pool.length] as WordEntry);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm -C packages/words test`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/words
git commit -m "feat: add original word list and word selection"
```

---

### Task 9: Events, effects, and the lobby-to-drawing transitions

**Files:**
- Create: `packages/protocol/src/events.ts`, `packages/protocol/src/reduce.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/reduce-start.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–8
- Produces:
  - `type GameEvent` and `type Effect` (discriminated unions, see below)
  - `createRoom(input: { id: RoomId; settings: RoomSettings }): RoomState`
  - `reduce(state: RoomState, event: GameEvent, ctx: ReducerCtx): ReduceResult`
  - `interface ReducerCtx { now: number; random: () => number; pickWords: typeof pickWordsFn }`
  - `interface ReduceResult { state: RoomState; effects: Effect[] }`

The reducer is pure. It returns a new state and a list of effects; it never performs one.

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/reduce-start.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types.js';
import { createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

const ctx: ReducerCtx = {
  now: 1_000,
  random: () => 0.5,
  pickWords: ({ count }) =>
    Array.from({ length: count }, (_, i) => ({
      text: `word${i}`, difficulty: 'easy' as const, category: 'test',
    })),
};

function roomWithTwoPlayers() {
  let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
  state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ada', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
  state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bo', avatarSeed: 'b', ip: '2.2.2.2' }, ctx).state;
  return state;
}

describe('PLAYER_JOINED', () => {
  it('makes the first player the host', () => {
    const state = roomWithTwoPlayers();
    expect(state.hostId).toBe('p1');
  });

  it('starts every player at zero', () => {
    const state = roomWithTwoPlayers();
    expect(state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('rejects a join when the room is full', () => {
    let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, maxPlayers: 2 } });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p2', name: 'B', avatarSeed: 'b', ip: '2.2.2.2' }, ctx).state;
    const result = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p3', name: 'C', avatarSeed: 'c', ip: '3.3.3.3' }, ctx);
    expect(result.state.players).toHaveLength(2);
    expect(result.effects).toContainEqual({ type: 'REJECT', playerId: 'p3', reason: 'room-full' });
  });

  it('rejects a banned IP', () => {
    const state = { ...roomWithTwoPlayers(), bans: [{ playerId: 'px', ip: '9.9.9.9' }] };
    const result = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p9', name: 'X', avatarSeed: 'x', ip: '9.9.9.9' }, ctx);
    expect(result.effects).toContainEqual({ type: 'REJECT', playerId: 'p9', reason: 'banned' });
  });
});

describe('START_GAME', () => {
  it('moves to word-select', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.phase.name).toBe('word-select');
  });

  it('offers the configured number of choices to the drawer', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx);
    const phase = result.state.phase;
    if (phase.name !== 'word-select') throw new Error('expected word-select');
    expect(phase.choices).toHaveLength(DEFAULT_SETTINGS.wordChoices);
  });

  it('ignores a start from a non-host', () => {
    const result = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p2' }, ctx);
    expect(result.state.phase.name).toBe('lobby');
  });

  it('refuses to start with fewer than two players', () => {
    let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: '1.1.1.1' }, ctx).state;
    const result = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx);
    expect(result.state.phase.name).toBe('lobby');
  });
});

describe('WORD_CHOSEN', () => {
  it('moves to drawing with a deadline derived from drawTimeSec', () => {
    let state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    if (state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(state.phase.word.text).toBe('word0');
    expect(state.phase.endsAt).toBe(ctx.now + DEFAULT_SETTINGS.drawTimeSec * 1000);
  });

  it('ignores a choice from a player who is not the drawer', () => {
    let state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    const other = drawerId === 'p1' ? 'p2' : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: other, choiceIndex: 0 }, ctx).state;
    expect(state.phase.name).toBe('word-select');
  });

  it('emits a canvas clear when drawing begins', () => {
    let state = reduce(roomWithTwoPlayers(), { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : '';
    const result = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx);
    expect(result.effects).toContainEqual({ type: 'CLEAR_CANVAS' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test reduce-start`
Expected: FAIL — module not found.

- [ ] **Step 3: Write events and effects**

`packages/protocol/src/events.ts`:
```ts
import type { PlayerId, RoomSettings } from './types.js';

export type GameEvent =
  | { type: 'PLAYER_JOINED'; playerId: PlayerId; name: string; avatarSeed: string; ip: string }
  | { type: 'PLAYER_LEFT'; playerId: PlayerId }
  | { type: 'PLAYER_RECONNECTED'; playerId: PlayerId }
  | { type: 'SETTINGS_CHANGED'; playerId: PlayerId; settings: RoomSettings }
  | { type: 'START_GAME'; playerId: PlayerId }
  | { type: 'WORD_CHOSEN'; playerId: PlayerId; choiceIndex: number }
  | { type: 'GUESS'; playerId: PlayerId; text: string }
  | { type: 'KICK'; playerId: PlayerId; targetId: PlayerId; ban: boolean }
  | { type: 'VOTEKICK'; playerId: PlayerId; targetId: PlayerId }
  | { type: 'TICK' };

export type Effect =
  | { type: 'BROADCAST_STATE' }
  | { type: 'REJECT'; playerId: PlayerId; reason: 'room-full' | 'banned' | 'name-taken' }
  | { type: 'CHAT'; scope: 'all' | 'guessed'; from: PlayerId | null; text: string; kind: 'message' | 'system' | 'correct' }
  | { type: 'PRIVATE'; playerId: PlayerId; text: string; kind: 'close' | 'warning' }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'REVOKE_VOICE'; playerId: PlayerId }
  | { type: 'DISCONNECT'; playerId: PlayerId };
```

- [ ] **Step 4: Write the reducer skeleton and these transitions**

`packages/protocol/src/reduce.ts`:
```ts
import type { GameEvent, Effect } from './events.js';
import type { Phase, Player, PlayerId, RoomId, RoomSettings, RoomState, TurnWord } from './types.js';
import type { GameMode } from './types.js';
import type { Difficulty } from './score.js';
import { buildHintSchedule } from './hints.js';

export interface PickWordsFn {
  (input: {
    count: number;
    exclude: readonly string[];
    customWords: readonly string[];
    customWordsOnly: boolean;
    mode: GameMode;
    random: () => number;
  }): { text: string; difficulty: Difficulty }[];
}

export interface ReducerCtx {
  now: number;
  random: () => number;
  pickWords: PickWordsFn;
}

export interface ReduceResult {
  state: RoomState;
  effects: Effect[];
}

export const WORD_SELECT_MS = 15_000;
export const TURN_END_MS = 6_000;
export const ROUND_END_MS = 6_000;

export function createRoom(input: { id: RoomId; settings: RoomSettings }): RoomState {
  return {
    id: input.id,
    hostId: null,
    settings: input.settings,
    players: [],
    turnOrder: [],
    turnIndex: 0,
    round: 0,
    phase: { name: 'lobby' },
    usedWords: [],
    bans: [],
  };
}

export function reduce(state: RoomState, event: GameEvent, ctx: ReducerCtx): ReduceResult {
  switch (event.type) {
    case 'PLAYER_JOINED':
      return playerJoined(state, event, ctx);
    case 'START_GAME':
      return startGame(state, event, ctx);
    case 'WORD_CHOSEN':
      return wordChosen(state, event, ctx);
    default:
      return { state, effects: [] };
  }
}

function playerJoined(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_JOINED' }>,
  ctx: ReducerCtx,
): ReduceResult {
  if (state.bans.some((b) => b.ip === event.ip)) {
    return { state, effects: [{ type: 'REJECT', playerId: event.playerId, reason: 'banned' }] };
  }
  if (state.players.length >= state.settings.maxPlayers) {
    return { state, effects: [{ type: 'REJECT', playerId: event.playerId, reason: 'room-full' }] };
  }

  const player: Player = {
    id: event.playerId,
    name: event.name,
    avatarSeed: event.avatarSeed,
    score: 0,
    connected: true,
    seatExpiresAt: null,
    joinedAt: ctx.now,
    ip: event.ip,
  };

  return {
    state: {
      ...state,
      hostId: state.hostId ?? player.id,
      players: [...state.players, player],
    },
    effects: [
      { type: 'BROADCAST_STATE' },
      { type: 'CHAT', scope: 'all', from: null, text: `${player.name} joined`, kind: 'system' },
    ],
  };
}

function startGame(
  state: RoomState,
  event: Extract<GameEvent, { type: 'START_GAME' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const connected = state.players.filter((p) => p.connected);
  if (state.phase.name !== 'lobby') return { state, effects: [] };
  if (event.playerId !== state.hostId) return { state, effects: [] };
  if (connected.length < 2) return { state, effects: [] };

  const reset = {
    ...state,
    players: state.players.map((p) => ({ ...p, score: 0 })),
    round: 1,
    turnIndex: 0,
    usedWords: [],
    turnOrder: shuffle(connected.map((p) => p.id), ctx.random),
  };

  return beginWordSelect(reset, ctx);
}

/** Shared by START_GAME and every subsequent turn advance. */
export function beginWordSelect(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const drawerId = state.turnOrder[state.turnIndex];
  if (drawerId === undefined) return { state, effects: [] };

  const choices: TurnWord[] = ctx.pickWords({
    count: state.settings.wordChoices,
    exclude: state.usedWords,
    customWords: state.settings.customWords,
    customWordsOnly: state.settings.customWordsOnly,
    mode: state.settings.mode,
    random: ctx.random,
  });

  const phase: Phase = {
    name: 'word-select',
    drawerId,
    choices,
    endsAt: ctx.now + WORD_SELECT_MS,
  };

  return { state: { ...state, phase }, effects: [{ type: 'BROADCAST_STATE' }] };
}

function wordChosen(
  state: RoomState,
  event: Extract<GameEvent, { type: 'WORD_CHOSEN' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const phase = state.phase;
  if (phase.name !== 'word-select') return { state, effects: [] };
  if (event.playerId !== phase.drawerId) return { state, effects: [] };

  const word = phase.choices[event.choiceIndex] ?? phase.choices[0];
  if (word === undefined) return { state, effects: [] };

  return startDrawing(state, phase.drawerId, word, ctx);
}

/** Shared by WORD_CHOSEN and the word-select timeout auto-pick. */
export function startDrawing(
  state: RoomState,
  drawerId: PlayerId,
  word: TurnWord,
  ctx: ReducerCtx,
): ReduceResult {
  const drawTimeMs = state.settings.drawTimeSec * 1000;

  const phase: Phase = {
    name: 'drawing',
    drawerId,
    word,
    startedAt: ctx.now,
    endsAt: ctx.now + drawTimeMs,
    revealed: [],
    schedule: buildHintSchedule({
      word: word.text,
      hints: state.settings.hints,
      drawTimeMs,
      mode: state.settings.mode,
      random: ctx.random,
    }),
    correct: [],
  };

  return {
    state: { ...state, phase, usedWords: [...state.usedWords, word.text] },
    effects: [{ type: 'CLEAR_CANVAS' }, { type: 'BROADCAST_STATE' }],
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
```

Add to `packages/protocol/src/index.ts`:
```ts
export * from './events.js';
export * from './reduce.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C packages/protocol test reduce-start`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/events.ts packages/protocol/src/reduce.ts packages/protocol/src/index.ts packages/protocol/test/reduce-start.test.ts
git commit -m "feat: add game events, effects, and start-of-turn transitions"
```

---

### Task 10: Guessing, hint ticks, and turn scoring

**Files:**
- Modify: `packages/protocol/src/reduce.ts` (add `GUESS` and `TICK` handling)
- Test: `packages/protocol/test/reduce-guess.test.ts`

**Interfaces:**
- Consumes: `classifyGuess`, `guesserScore`, `drawerScore`, `beginWordSelect`, `startDrawing` from earlier tasks
- Produces: `FIRST_GUESS_CLAMP_MS = 30_000`; the `GUESS` and `TICK` branches of `reduce`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/reduce-guess.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { FIRST_GUESS_CLAMP_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

/** A room already in the drawing phase, drawer p1, word "apple", 80s clock from t=0. */
function drawingRoom(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 0 } });
  for (const [id, name] of [['p1', 'Ada'], ['p2', 'Bo'], ['p3', 'Cy']] as const) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name, avatarSeed: id, ip: id }, ctx).state;
  }
  state = { ...state, turnOrder: ['p1', 'p2', 'p3'], turnIndex: 0, round: 1 };
  state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
  state = { ...state, turnOrder: ['p1', 'p2', 'p3'], turnIndex: 0 };
  if (state.phase.name === 'word-select') {
    state = { ...state, phase: { ...state.phase, drawerId: 'p1' } };
  }
  return reduce(state, { type: 'WORD_CHOSEN', playerId: 'p1', choiceIndex: 0 }, ctx).state;
}

describe('GUESS', () => {
  it('scores a correct guess and records the player', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000));
    const player = result.state.players.find((p) => p.id === 'p2');
    expect(player?.score).toBeGreaterThan(0);
    if (result.state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(result.state.phase.correct.map((c) => c.playerId)).toEqual(['p2']);
  });

  it('does not broadcast the guess text when it is correct', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000));
    const chat = result.effects.filter((e) => e.type === 'CHAT');
    expect(JSON.stringify(chat)).not.toContain('apple');
  });

  it('sends a private notice for a close guess and broadcasts nothing', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'aple' }, ctxAt(10_000));
    expect(result.effects).toContainEqual({ type: 'PRIVATE', playerId: 'p2', text: 'aple', kind: 'close' });
    expect(result.effects.some((e) => e.type === 'CHAT' && e.scope === 'all')).toBe(false);
  });

  it('broadcasts a wrong guess to the room', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'banana' }, ctxAt(10_000));
    expect(result.effects).toContainEqual({
      type: 'CHAT', scope: 'all', from: 'p2', text: 'banana', kind: 'message',
    });
  });

  it('ignores a guess from the drawer and warns them if it contains the word', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p1', text: 'apple' }, ctxAt(10_000));
    expect(result.effects.some((e) => e.type === 'PRIVATE' && e.kind === 'warning')).toBe(true);
    expect(result.effects.some((e) => e.type === 'CHAT' && e.scope === 'all')).toBe(false);
  });

  it('routes chat from a player who already guessed to the guessed-only channel', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    const result = reduce(state, { type: 'GUESS', playerId: 'p2', text: 'nice one' }, ctxAt(11_000));
    expect(result.effects).toContainEqual({
      type: 'CHAT', scope: 'guessed', from: 'p2', text: 'nice one', kind: 'message',
    });
  });

  it('awards fewer points to a later guesser', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(20_000)).state;
    const p2 = state.players.find((p) => p.id === 'p2')!.score;
    const p3 = state.players.find((p) => p.id === 'p3')!.score;
    expect(p3).toBeLessThan(p2);
  });

  it('clamps the clock after the first correct guess', () => {
    const result = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(1_000));
    if (result.state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(result.state.phase.endsAt).toBe(1_000 + FIRST_GUESS_CLAMP_MS);
  });

  it('ends the turn once every guesser is correct', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(12_000)).state;
    expect(state.phase.name).toBe('turn-end');
  });

  it('awards the drawer when the turn ends', () => {
    let state = reduce(drawingRoom(), { type: 'GUESS', playerId: 'p2', text: 'apple' }, ctxAt(10_000)).state;
    state = reduce(state, { type: 'GUESS', playerId: 'p3', text: 'apple' }, ctxAt(12_000)).state;
    expect(state.players.find((p) => p.id === 'p1')!.score).toBeGreaterThan(0);
  });
});

describe('TICK', () => {
  it('reveals a scheduled hint once its time arrives', () => {
    const ctx = ctxAt(0);
    let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 2 } });
    for (const id of ['p1', 'p2']) {
      state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
    }
    state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    state = reduce(state, { type: 'TICK' }, ctxAt(70_000)).state;
    if (state.phase.name !== 'drawing') throw new Error('expected drawing');
    expect(state.phase.revealed.length).toBeGreaterThan(0);
  });

  it('ends the turn when the clock expires with nobody correct', () => {
    const state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    expect(state.phase.name).toBe('turn-end');
  });

  it('awards nobody when nobody guessed', () => {
    const state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    expect(state.players.every((p) => p.score === 0)).toBe(true);
  });

  it('advances to the next drawer after turn-end elapses', () => {
    let state = reduce(drawingRoom(), { type: 'TICK' }, ctxAt(80_001)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(90_000)).state;
    expect(state.phase.name).toBe('word-select');
    expect(state.turnIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test reduce-guess`
Expected: FAIL — `GUESS` and `TICK` fall through to the default branch, so nothing changes.

- [ ] **Step 3: Implement the GUESS branch**

Add these imports to `packages/protocol/src/reduce.ts`:
```ts
import { classifyGuess } from './guess.js';
import { normalize } from './text.js';
import { drawerScore, guesserScore } from './score.js';
```

Then add the handler:
```ts
export const FIRST_GUESS_CLAMP_MS = 30_000;

function guess(
  state: RoomState,
  event: Extract<GameEvent, { type: 'GUESS' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const phase = state.phase;

  // Outside a live turn, chat is just chat.
  if (phase.name !== 'drawing') {
    return {
      state,
      effects: [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  // The drawer may chat, but never in a way that leaks the answer.
  if (event.playerId === phase.drawerId) {
    const leaks = classifyGuess(event.text, phase.word.text) !== 'wrong' ||
      normalize(event.text).includes(normalize(phase.word.text));
    return {
      state,
      effects: leaks
        ? [{ type: 'PRIVATE', playerId: event.playerId, text: 'That gives it away — blocked.', kind: 'warning' }]
        : [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  // Already correct: your chat goes to the guessed-only channel.
  if (phase.correct.some((c) => c.playerId === event.playerId)) {
    return {
      state,
      effects: [{ type: 'CHAT', scope: 'guessed', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  const verdict = classifyGuess(event.text, phase.word.text);

  if (verdict === 'wrong') {
    return {
      state,
      effects: [{ type: 'CHAT', scope: 'all', from: event.playerId, text: event.text, kind: 'message' }],
    };
  }

  if (verdict === 'close') {
    return {
      state,
      effects: [{ type: 'PRIVATE', playerId: event.playerId, text: event.text, kind: 'close' }],
    };
  }

  // Correct.
  const drawTimeMs = state.settings.drawTimeSec * 1000;
  const points = guesserScore({
    timeRemainingMs: phase.endsAt - ctx.now,
    drawTimeMs,
    difficulty: phase.word.difficulty,
  });

  const isFirst = phase.correct.length === 0;
  const nextPhase: Phase = {
    ...phase,
    endsAt: isFirst ? Math.min(phase.endsAt, ctx.now + FIRST_GUESS_CLAMP_MS) : phase.endsAt,
    correct: [...phase.correct, { playerId: event.playerId, atMs: ctx.now, points }],
  };

  const withScore: RoomState = {
    ...state,
    phase: nextPhase,
    players: state.players.map((p) =>
      p.id === event.playerId ? { ...p, score: p.score + points } : p,
    ),
  };

  const guesserCount = state.players.filter((p) => p.connected && p.id !== phase.drawerId).length;
  const effects: Effect[] = [
    { type: 'CHAT', scope: 'all', from: null, text: `${nameOf(state, event.playerId)} guessed it`, kind: 'correct' },
    { type: 'BROADCAST_STATE' },
  ];

  if (nextPhase.correct.length >= guesserCount) {
    const ended = endTurn(withScore, ctx);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }

  return { state: withScore, effects };
}

function nameOf(state: RoomState, playerId: PlayerId): string {
  return state.players.find((p) => p.id === playerId)?.name ?? 'someone';
}
```

- [ ] **Step 4: Implement turn ending and the TICK branch**

```ts
/** Close out the current drawing turn, award the drawer, and move to turn-end. */
export function endTurn(state: RoomState, ctx: ReducerCtx, voided = false): ReduceResult {
  const phase = state.phase;
  if (phase.name !== 'drawing') return { state, effects: [] };

  const otherPlayerCount = state.players.filter((p) => p.connected && p.id !== phase.drawerId).length;

  const deltas: Record<PlayerId, number> = {};
  let players = state.players;

  if (!voided) {
    for (const entry of phase.correct) deltas[entry.playerId] = entry.points;

    const award = drawerScore({
      guesserScores: phase.correct.map((c) => c.points),
      otherPlayerCount,
    });
    if (award > 0) {
      deltas[phase.drawerId] = award;
      players = players.map((p) => (p.id === phase.drawerId ? { ...p, score: p.score + award } : p));
    }
  }

  return {
    state: {
      ...state,
      players,
      phase: { name: 'turn-end', word: phase.word.text, deltas, endsAt: ctx.now + TURN_END_MS },
    },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

function tick(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const phase = state.phase;

  switch (phase.name) {
    case 'word-select': {
      if (ctx.now < phase.endsAt) return { state, effects: [] };
      const word = phase.choices[0];
      if (word === undefined) return { state, effects: [] };
      return startDrawing(state, phase.drawerId, word, ctx);
    }

    case 'drawing': {
      if (ctx.now >= phase.endsAt) return endTurn(state, ctx);

      const elapsed = ctx.now - phase.startedAt;
      const due = phase.schedule
        .filter((r) => r.atElapsedMs <= elapsed && !phase.revealed.includes(r.index))
        .map((r) => r.index);

      if (due.length === 0) return { state, effects: [] };

      return {
        state: { ...state, phase: { ...phase, revealed: [...phase.revealed, ...due] } },
        effects: [{ type: 'BROADCAST_STATE' }],
      };
    }

    case 'turn-end':
      return ctx.now >= phase.endsAt ? advanceTurn(state, ctx) : { state, effects: [] };

    case 'round-end':
      return ctx.now >= phase.endsAt ? advanceRound(state, ctx) : { state, effects: [] };

    default:
      return { state, effects: [] };
  }
}

function advanceTurn(state: RoomState, ctx: ReducerCtx): ReduceResult {
  const nextIndex = state.turnIndex + 1;

  if (nextIndex < state.turnOrder.length) {
    return beginWordSelect({ ...state, turnIndex: nextIndex }, ctx);
  }
  return {
    state: { ...state, phase: { name: 'round-end', endsAt: ctx.now + ROUND_END_MS } },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

function advanceRound(state: RoomState, ctx: ReducerCtx): ReduceResult {
  if (state.round >= state.settings.rounds) {
    return { state: { ...state, phase: { name: 'game-end' } }, effects: [{ type: 'BROADCAST_STATE' }] };
  }

  const connected = state.players.filter((p) => p.connected).map((p) => p.id);
  return beginWordSelect(
    {
      ...state,
      round: state.round + 1,
      turnIndex: 0,
      turnOrder: shuffle(connected, ctx.random),
    },
    ctx,
  );
}
```

Wire both into the `reduce` switch:
```ts
    case 'GUESS':
      return guess(state, event, ctx);
    case 'TICK':
      return tick(state, ctx);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C packages/protocol test reduce-guess`
Expected: PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/reduce.ts packages/protocol/test/reduce-guess.test.ts
git commit -m "feat: add guessing, hint reveals, and turn scoring"
```

---

### Task 11: Disconnect, reconnect, host migration, and kicks

**Files:**
- Modify: `packages/protocol/src/reduce.ts`
- Test: `packages/protocol/test/reduce-presence.test.ts`

**Interfaces:**
- Consumes: `endTurn`, `advanceTurn` behaviour from Task 10
- Produces: `SEAT_HOLD_MS = 60_000`; the `PLAYER_LEFT`, `PLAYER_RECONNECTED`, `KICK`, `VOTEKICK`, and `SETTINGS_CHANGED` branches

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/reduce-presence.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { SEAT_HOLD_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

function lobbyOfThree(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
  for (const id of ['p1', 'p2', 'p3']) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
  }
  return state;
}

describe('PLAYER_LEFT', () => {
  it('keeps the seat and marks the player disconnected', () => {
    const result = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000));
    const player = result.state.players.find((p) => p.id === 'p2');
    expect(player?.connected).toBe(false);
    expect(player?.seatExpiresAt).toBe(1_000 + SEAT_HOLD_MS);
  });

  it('migrates the host to the longest-connected remaining player', () => {
    const result = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p1' }, ctxAt(1_000));
    expect(result.state.hostId).toBe('p2');
  });

  it('reaps the seat once the hold expires', () => {
    let state = reduce(lobbyOfThree(), { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(1_000 + SEAT_HOLD_MS + 1)).state;
    expect(state.players.find((p) => p.id === 'p2')).toBeUndefined();
  });
});

describe('PLAYER_RECONNECTED', () => {
  it('restores the seat with its score intact', () => {
    let state = lobbyOfThree();
    state = { ...state, players: state.players.map((p) => (p.id === 'p2' ? { ...p, score: 250 } : p)) };
    state = reduce(state, { type: 'PLAYER_LEFT', playerId: 'p2' }, ctxAt(1_000)).state;
    state = reduce(state, { type: 'PLAYER_RECONNECTED', playerId: 'p2' }, ctxAt(5_000)).state;

    const player = state.players.find((p) => p.id === 'p2');
    expect(player?.connected).toBe(true);
    expect(player?.score).toBe(250);
    expect(player?.seatExpiresAt).toBeNull();
  });
});

describe('drawer disconnect', () => {
  it('voids the turn so nobody scores', () => {
    const ctx = ctxAt(0);
    let state = lobbyOfThree();
    state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;

    const guesser = state.players.find((p) => p.id !== drawerId)!.id;
    state = reduce(state, { type: 'GUESS', playerId: guesser, text: 'apple' }, ctxAt(5_000)).state;
    state = reduce(state, { type: 'PLAYER_LEFT', playerId: drawerId }, ctxAt(6_000)).state;

    expect(state.phase.name).toBe('turn-end');
    if (state.phase.name !== 'turn-end') throw new Error('expected turn-end');
    expect(state.phase.deltas).toEqual({});
  });
});

describe('KICK', () => {
  it('removes the target and revokes their voice token', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p1', targetId: 'p3', ban: false }, ctxAt(1_000));
    expect(result.state.players.find((p) => p.id === 'p3')).toBeUndefined();
    expect(result.effects).toContainEqual({ type: 'REVOKE_VOICE', playerId: 'p3' });
    expect(result.effects).toContainEqual({ type: 'DISCONNECT', playerId: 'p3' });
  });

  it('records a ban against the target IP', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p1', targetId: 'p3', ban: true }, ctxAt(1_000));
    expect(result.state.bans).toEqual([{ playerId: 'p3', ip: 'p3' }]);
  });

  it('ignores a kick from a non-host', () => {
    const result = reduce(lobbyOfThree(), { type: 'KICK', playerId: 'p2', targetId: 'p3', ban: false }, ctxAt(1_000));
    expect(result.state.players).toHaveLength(3);
  });
});

describe('SETTINGS_CHANGED', () => {
  it('accepts a host change in the lobby', () => {
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(lobbyOfThree(), { type: 'SETTINGS_CHANGED', playerId: 'p1', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(5);
  });

  it('ignores a change from a non-host', () => {
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(lobbyOfThree(), { type: 'SETTINGS_CHANGED', playerId: 'p2', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(DEFAULT_SETTINGS.rounds);
  });

  it('ignores a change once the game is running', () => {
    let state = reduce(lobbyOfThree(), { type: 'START_GAME', playerId: 'p1' }, ctxAt(0)).state;
    const next = { ...DEFAULT_SETTINGS, rounds: 5 };
    const result = reduce(state, { type: 'SETTINGS_CHANGED', playerId: 'p1', settings: next }, ctxAt(0));
    expect(result.state.settings.rounds).toBe(DEFAULT_SETTINGS.rounds);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test reduce-presence`
Expected: FAIL — these events hit the default branch and change nothing.

- [ ] **Step 3: Write the implementation**

Add to `packages/protocol/src/reduce.ts`:
```ts
export const SEAT_HOLD_MS = 60_000;

function playerLeft(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_LEFT' }>,
  ctx: ReducerCtx,
): ReduceResult {
  const leaving = state.players.find((p) => p.id === event.playerId);
  if (leaving === undefined) return { state, effects: [] };

  let next: RoomState = {
    ...state,
    players: state.players.map((p) =>
      p.id === event.playerId
        ? { ...p, connected: false, seatExpiresAt: ctx.now + SEAT_HOLD_MS }
        : p,
    ),
  };

  if (state.hostId === event.playerId) {
    const successor = next.players
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    next = { ...next, hostId: successor?.id ?? null };
  }

  const effects: Effect[] = [
    { type: 'BROADCAST_STATE' },
    { type: 'CHAT', scope: 'all', from: null, text: `${leaving.name} left`, kind: 'system' },
  ];

  // The drawer leaving voids the turn — nobody scores, including prior guessers.
  if (next.phase.name === 'drawing' && next.phase.drawerId === event.playerId) {
    const ended = endTurn(next, ctx, true);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }

  return { state: next, effects };
}

function playerReconnected(
  state: RoomState,
  event: Extract<GameEvent, { type: 'PLAYER_RECONNECTED' }>,
): ReduceResult {
  const seat = state.players.find((p) => p.id === event.playerId);
  if (seat === undefined) return { state, effects: [] };

  return {
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === event.playerId ? { ...p, connected: true, seatExpiresAt: null } : p,
      ),
    },
    effects: [{ type: 'BROADCAST_STATE' }],
  };
}

function kick(
  state: RoomState,
  event: Extract<GameEvent, { type: 'KICK' }>,
  ctx: ReducerCtx,
): ReduceResult {
  if (event.playerId !== state.hostId) return { state, effects: [] };
  return removePlayer(state, event.targetId, event.ban, ctx);
}

function votekick(
  state: RoomState,
  event: Extract<GameEvent, { type: 'VOTEKICK' }>,
  ctx: ReducerCtx,
): ReduceResult {
  // Simple majority of connected players excluding the target.
  const eligible = state.players.filter((p) => p.connected && p.id !== event.targetId).length;
  if (eligible < 2) return { state, effects: [] };
  return removePlayer(state, event.targetId, false, ctx);
}

function removePlayer(
  state: RoomState,
  targetId: PlayerId,
  ban: boolean,
  ctx: ReducerCtx,
): ReduceResult {
  const target = state.players.find((p) => p.id === targetId);
  if (target === undefined) return { state, effects: [] };

  let next: RoomState = {
    ...state,
    players: state.players.filter((p) => p.id !== targetId),
    turnOrder: state.turnOrder.filter((id) => id !== targetId),
    bans: ban ? [...state.bans, { playerId: targetId, ip: target.ip }] : state.bans,
  };

  if (next.hostId === targetId) {
    const successor = next.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    next = { ...next, hostId: successor?.id ?? null };
  }

  const effects: Effect[] = [
    { type: 'REVOKE_VOICE', playerId: targetId },
    { type: 'DISCONNECT', playerId: targetId },
    { type: 'CHAT', scope: 'all', from: null, text: `${target.name} was removed`, kind: 'system' },
    { type: 'BROADCAST_STATE' },
  ];

  if (next.phase.name === 'drawing' && next.phase.drawerId === targetId) {
    const ended = endTurn(next, ctx, true);
    return { state: ended.state, effects: [...effects, ...ended.effects] };
  }
  return { state: next, effects };
}

function settingsChanged(
  state: RoomState,
  event: Extract<GameEvent, { type: 'SETTINGS_CHANGED' }>,
): ReduceResult {
  if (event.playerId !== state.hostId) return { state, effects: [] };
  if (state.phase.name !== 'lobby') return { state, effects: [] };
  return { state: { ...state, settings: event.settings }, effects: [{ type: 'BROADCAST_STATE' }] };
}
```

The ban records `target.ip`, which the `Player` record carries from Task 6 and `playerJoined` populates from `event.ip`. `redactStateFor` already strips it, so a ban never leaks an address to a client.

- [ ] **Step 4: Add seat reaping to the tick handler**

Replace the `tick` function from Task 10 with this version. It reaps expired seats first, then falls through to the same phase switch:

```ts
function tick(input: RoomState, ctx: ReducerCtx): ReduceResult {
  const reaped: Effect[] = [];
  let state = input;

  const expired = state.players.filter(
    (p) => !p.connected && p.seatExpiresAt !== null && ctx.now >= p.seatExpiresAt,
  );

  if (expired.length > 0) {
    const ids = new Set(expired.map((p) => p.id));
    state = {
      ...state,
      players: state.players.filter((p) => !ids.has(p.id)),
      turnOrder: state.turnOrder.filter((id) => !ids.has(id)),
    };
    reaped.push({ type: 'BROADCAST_STATE' });
  }

  const result = tickPhase(state, ctx);
  return { state: result.state, effects: [...reaped, ...result.effects] };
}
```

Rename the existing body from Task 10 to `tickPhase(state: RoomState, ctx: ReducerCtx): ReduceResult` — its contents are unchanged.

Wire the new branches into `reduce`:
```ts
    case 'PLAYER_LEFT':
      return playerLeft(state, event, ctx);
    case 'PLAYER_RECONNECTED':
      return playerReconnected(state, event);
    case 'KICK':
      return kick(state, event, ctx);
    case 'VOTEKICK':
      return votekick(state, event, ctx);
    case 'SETTINGS_CHANGED':
      return settingsChanged(state, event);
```

- [ ] **Step 5: Run the full protocol suite**

Run: `pnpm -C packages/protocol test`
Expected: PASS, every suite green.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol
git commit -m "feat: add presence, reconnect, host migration, and kicks"
```

---

### Task 12: Wire message schemas

**Files:**
- Create: `packages/protocol/src/messages.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: `roomSettingsSchema` from `./types.js`
- Produces: `clientMessageSchema`, `ClientMessage`, `ServerMessage`, `STROKE_BINARY_HEADER`

- [ ] **Step 1: Write the failing test**

`packages/protocol/test/messages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clientMessageSchema } from '../src/messages.js';

describe('clientMessageSchema', () => {
  it('accepts a join', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: 'Ada', avatarSeed: 'seed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: '', avatarSeed: 'seed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an over-long name', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: 'x'.repeat(25), avatarSeed: 'seed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(clientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('rejects a chat message that is too long', () => {
    const result = clientMessageSchema.safeParse({ type: 'chat', text: 'x'.repeat(300) });
    expect(result.success).toBe(false);
  });

  it('accepts a word choice', () => {
    expect(clientMessageSchema.safeParse({ type: 'choose-word', index: 1 }).success).toBe(true);
  });

  it('rejects a negative word choice index', () => {
    expect(clientMessageSchema.safeParse({ type: 'choose-word', index: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/protocol test messages`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/protocol/src/messages.ts`:
```ts
import { z } from 'zod';
import { roomSettingsSchema } from './types.js';
import type { ClientRoomView } from './redact.js';

export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    roomId: z.string().min(4).max(16),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    avatarSeed: z.string().min(1).max(64),
    rejoinToken: z.string().max(512).optional(),
  }),
  z.object({ type: z.literal('settings'), settings: roomSettingsSchema }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('choose-word'), index: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal('chat'), text: z.string().min(1).max(MAX_CHAT_LENGTH) }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('clear') }),
  z.object({ type: z.literal('kick'), targetId: z.string(), ban: z.boolean() }),
  z.object({ type: z.literal('votekick'), targetId: z.string() }),
  z.object({ type: z.literal('pong') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'welcome'; playerId: string; rejoinToken: string; view: ClientRoomView }
  | { type: 'state'; view: ClientRoomView }
  | { type: 'chat'; from: string | null; text: string; kind: 'message' | 'system' | 'correct'; scope: 'all' | 'guessed' }
  | { type: 'private'; text: string; kind: 'close' | 'warning' }
  | { type: 'clear' }
  | { type: 'undo'; strokeCount: number }
  | { type: 'error'; reason: string }
  | { type: 'ping' };

/** First byte of every binary frame, so stroke data is unambiguous. */
export const STROKE_BINARY_HEADER = 0x01;
```

Add `export * from './messages.js';` to `packages/protocol/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/protocol test messages`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/messages.ts packages/protocol/src/index.ts packages/protocol/test/messages.test.ts
git commit -m "feat: add validated wire message schemas"
```

---

### Task 13: Room store and stroke relay

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/rooms/store.ts`, `apps/server/src/net/strokes.ts`, `apps/server/src/net/ratelimit.ts`
- Test: `apps/server/test/unit/store.test.ts`, `apps/server/test/unit/strokes.test.ts`, `apps/server/test/unit/ratelimit.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `createRoom` from `@scrible/protocol`
- Produces:
  - `interface RoomStore { create(settings): RoomState; get(id): RoomState | undefined; set(state): void; delete(id): void; ids(): string[] }`
  - `class MemoryRoomStore implements RoomStore`
  - `class StrokeRelay { append(frame: Uint8Array): void; undo(): number; clear(): void; log(): Uint8Array[] }`
  - `class TokenBucket { constructor(capacity: number, refillPerSec: number); tryConsume(now: number): boolean }`

- [ ] **Step 1: Write the failing tests**

`apps/server/test/unit/ratelimit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../../src/net/ratelimit.js';

describe('TokenBucket', () => {
  it('allows up to capacity immediately', () => {
    const bucket = new TokenBucket(3, 1);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(false);
  });

  it('refills over time', () => {
    const bucket = new TokenBucket(1, 2);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(100)).toBe(false);
    expect(bucket.tryConsume(600)).toBe(true);
  });

  it('never exceeds capacity when refilling', () => {
    const bucket = new TokenBucket(2, 10);
    bucket.tryConsume(0);
    bucket.tryConsume(0);
    expect(bucket.tryConsume(100_000)).toBe(true);
    expect(bucket.tryConsume(100_000)).toBe(true);
    expect(bucket.tryConsume(100_000)).toBe(false);
  });
});
```

`apps/server/test/unit/strokes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { StrokeRelay } from '../../src/net/strokes.js';

describe('StrokeRelay', () => {
  it('accumulates frames in order', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.append(new Uint8Array([2]));
    expect(relay.log()).toHaveLength(2);
  });

  it('undo removes the last frame and reports the new count', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.append(new Uint8Array([2]));
    expect(relay.undo()).toBe(1);
    expect(relay.log()).toHaveLength(1);
  });

  it('undo on an empty log is a no-op', () => {
    const relay = new StrokeRelay();
    expect(relay.undo()).toBe(0);
  });

  it('clear empties the log', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.clear();
    expect(relay.log()).toEqual([]);
  });

  it('drops the oldest frames past the cap so memory stays bounded', () => {
    const relay = new StrokeRelay(3);
    for (let i = 0; i < 5; i++) relay.append(new Uint8Array([i]));
    expect(relay.log()).toHaveLength(3);
    expect(relay.log()[0]).toEqual(new Uint8Array([2]));
  });
});
```

`apps/server/test/unit/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@scrible/protocol';
import { MemoryRoomStore } from '../../src/rooms/store.js';

describe('MemoryRoomStore', () => {
  it('creates a room with a short id', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    expect(room.id).toMatch(/^[a-z0-9]{6}$/);
  });

  it('round-trips a room', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    expect(store.get(room.id)?.id).toBe(room.id);
  });

  it('returns undefined for an unknown id', () => {
    expect(new MemoryRoomStore().get('nope99')).toBeUndefined();
  });

  it('deletes a room', () => {
    const store = new MemoryRoomStore();
    const room = store.create(DEFAULT_SETTINGS);
    store.delete(room.id);
    expect(store.get(room.id)).toBeUndefined();
  });

  it('generates distinct ids', () => {
    const store = new MemoryRoomStore();
    const ids = new Set(Array.from({ length: 50 }, () => store.create(DEFAULT_SETTINGS).id));
    expect(ids.size).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C apps/server test`
Expected: FAIL — the package does not exist.

- [ ] **Step 3: Write the implementation**

`apps/server/package.json`:
```json
{
  "name": "@scrible/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scrible/protocol": "workspace:*",
    "@scrible/words": "workspace:*",
    "fastify": "^5.2.0",
    "ws": "^8.18.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

`apps/server/src/net/ratelimit.ts`:
```ts
export class TokenBucket {
  #tokens: number;
  #lastRefillMs = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.#tokens = capacity;
  }

  tryConsume(nowMs: number): boolean {
    const elapsedSec = Math.max(0, nowMs - this.#lastRefillMs) / 1000;
    this.#tokens = Math.min(this.capacity, this.#tokens + elapsedSec * this.refillPerSec);
    this.#lastRefillMs = nowMs;

    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
```

`apps/server/src/net/strokes.ts`:
```ts
/**
 * Keeps the current turn's stroke frames so a late joiner or a reconnecting
 * player can replay the canvas instead of seeing it blank.
 */
export class StrokeRelay {
  #frames: Uint8Array[] = [];

  constructor(private readonly maxFrames = 4_000) {}

  append(frame: Uint8Array): void {
    this.#frames.push(frame);
    if (this.#frames.length > this.maxFrames) {
      this.#frames = this.#frames.slice(this.#frames.length - this.maxFrames);
    }
  }

  /** Removes the most recent frame. Returns the resulting frame count. */
  undo(): number {
    this.#frames.pop();
    return this.#frames.length;
  }

  clear(): void {
    this.#frames = [];
  }

  log(): Uint8Array[] {
    return this.#frames;
  }
}
```

`apps/server/src/rooms/store.ts`:
```ts
import { createRoom, type RoomId, type RoomSettings, type RoomState } from '@scrible/protocol';

export interface RoomStore {
  create(settings: RoomSettings): RoomState;
  get(id: RoomId): RoomState | undefined;
  set(state: RoomState): void;
  delete(id: RoomId): void;
  ids(): RoomId[];
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 6;

/**
 * In-memory implementation. This is the seam for a future Redis backend —
 * swapping persistence means writing one more class, not touching callers.
 */
export class MemoryRoomStore implements RoomStore {
  #rooms = new Map<RoomId, RoomState>();

  create(settings: RoomSettings): RoomState {
    const room = createRoom({ id: this.#freshId(), settings });
    this.#rooms.set(room.id, room);
    return room;
  }

  get(id: RoomId): RoomState | undefined {
    return this.#rooms.get(id);
  }

  set(state: RoomState): void {
    this.#rooms.set(state.id, state);
  }

  delete(id: RoomId): void {
    this.#rooms.delete(id);
  }

  ids(): RoomId[] {
    return [...this.#rooms.keys()];
  }

  #freshId(): RoomId {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = Array.from(
        { length: ID_LENGTH },
        () => ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)],
      ).join('');
      if (!this.#rooms.has(id)) return id;
    }
    throw new Error('could not allocate a unique room id');
  }
}
```

Note the test asserts `/^[a-z0-9]{6}$/`, which the alphabet above satisfies.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm install && pnpm -C apps/server test`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: add room store, stroke relay, and rate limiting"
```

---

### Task 14: Room runtime — driving the reducer and executing effects

**Files:**
- Create: `apps/server/src/rooms/room.ts`
- Test: `apps/server/test/unit/room.test.ts`

**Interfaces:**
- Consumes: `RoomStore`, `StrokeRelay`, `reduce`, `redactStateFor`, `pickWords`
- Produces:
  - `interface Transport { send(playerId: string, message: ServerMessage): void; sendBinary(playerId: string, frame: Uint8Array): void; close(playerId: string): void; }`
  - `class RoomRuntime` with `constructor(id: RoomId, store: RoomStore, transport: Transport)`, `dispatch(event: GameEvent, now: number): void`, `tick(now: number): void`, `broadcastState(): void`, `hasPlayers(): boolean`, and a readonly `strokes: StrokeRelay`

`RoomRuntime` is the only place where effects become real. Injecting `Transport` keeps it unit-testable with a recording fake — no sockets in unit tests.

- [ ] **Step 1: Write the failing test**

`apps/server/test/unit/room.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServerMessage } from '@scrible/protocol';
import { MemoryRoomStore } from '../../src/rooms/store.js';
import { RoomRuntime, type Transport } from '../../src/rooms/room.js';

class FakeTransport implements Transport {
  sent: { playerId: string; message: ServerMessage }[] = [];
  closed: string[] = [];
  send(playerId: string, message: ServerMessage) { this.sent.push({ playerId, message }); }
  sendBinary() { /* not used in these tests */ }
  close(playerId: string) { this.closed.push(playerId); }

  messagesTo(playerId: string) { return this.sent.filter((s) => s.playerId === playerId).map((s) => s.message); }
  reset() { this.sent = []; this.closed = []; }
}

describe('RoomRuntime', () => {
  let store: MemoryRoomStore;
  let transport: FakeTransport;
  let runtime: RoomRuntime;

  beforeEach(() => {
    store = new MemoryRoomStore();
    transport = new FakeTransport();
    const room = store.create(DEFAULT_SETTINGS);
    runtime = new RoomRuntime(room.id, store, transport);
    runtime.dispatch({ type: 'PLAYER_JOINED', playerId: 'p1', name: 'Ada', avatarSeed: 'a', ip: '1.1.1.1' }, 0);
    runtime.dispatch({ type: 'PLAYER_JOINED', playerId: 'p2', name: 'Bo', avatarSeed: 'b', ip: '2.2.2.2' }, 0);
    transport.reset();
  });

  it('broadcasts a redacted state to every player', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    expect(transport.messagesTo('p1').some((m) => m.type === 'state')).toBe(true);
    expect(transport.messagesTo('p2').some((m) => m.type === 'state')).toBe(true);
  });

  it('never sends the word to a non-drawer', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    const other = drawerId === 'p1' ? 'p2' : 'p1';

    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);

    const live = store.get(runtime.id)!;
    if (live.phase.name !== 'drawing') throw new Error('expected drawing');
    const secret = live.phase.word.text;

    expect(JSON.stringify(transport.messagesTo(other))).not.toContain(secret);
  });

  it('clears the stroke log when a turn starts', () => {
    runtime.strokes.append(new Uint8Array([9]));
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);
    expect(runtime.strokes.log()).toEqual([]);
  });

  it('routes guessed-scope chat only to correct guessers and the drawer', () => {
    runtime.dispatch({ type: 'START_GAME', playerId: 'p1' }, 0);
    const state = store.get(runtime.id)!;
    const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
    runtime.dispatch({ type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, 0);

    const live = store.get(runtime.id)!;
    if (live.phase.name !== 'drawing') throw new Error('expected drawing');
    const guesser = live.players.find((p) => p.id !== drawerId)!.id;

    runtime.dispatch({ type: 'GUESS', playerId: guesser, text: live.phase.word.text }, 1_000);
    transport.reset();
    runtime.dispatch({ type: 'GUESS', playerId: guesser, text: 'good one' }, 2_000);

    const toDrawer = transport.messagesTo(drawerId).filter((m) => m.type === 'chat');
    expect(toDrawer.some((m) => m.type === 'chat' && m.text === 'good one')).toBe(true);
  });

  it('closes the socket of a kicked player', () => {
    runtime.dispatch({ type: 'KICK', playerId: 'p1', targetId: 'p2', ban: false }, 0);
    expect(transport.closed).toContain('p2');
  });

  it('reports when the room is empty so it can be reaped', () => {
    runtime.dispatch({ type: 'KICK', playerId: 'p1', targetId: 'p2', ban: false }, 0);
    expect(runtime.hasPlayers()).toBe(true);
    runtime.dispatch({ type: 'PLAYER_LEFT', playerId: 'p1' }, 0);
    runtime.tick(200_000);
    expect(runtime.hasPlayers()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/server test room`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`apps/server/src/rooms/room.ts`:
```ts
import {
  redactStateFor,
  reduce,
  type Effect,
  type GameEvent,
  type PlayerId,
  type RoomId,
  type RoomState,
  type ServerMessage,
} from '@scrible/protocol';
import { pickWords } from '@scrible/words';
import { StrokeRelay } from '../net/strokes.js';
import type { RoomStore } from './store.js';

export interface Transport {
  send(playerId: PlayerId, message: ServerMessage): void;
  sendBinary(playerId: PlayerId, frame: Uint8Array): void;
  close(playerId: PlayerId): void;
}

export class RoomRuntime {
  readonly strokes = new StrokeRelay();

  constructor(
    readonly id: RoomId,
    private readonly store: RoomStore,
    private readonly transport: Transport,
  ) {}

  dispatch(event: GameEvent, now: number): void {
    const before = this.store.get(this.id);
    if (before === undefined) return;

    const { state, effects } = reduce(before, event, { now, random: Math.random, pickWords });
    this.store.set(state);
    this.#runEffects(state, effects);
  }

  tick(now: number): void {
    this.dispatch({ type: 'TICK' }, now);
  }

  hasPlayers(): boolean {
    return (this.store.get(this.id)?.players.length ?? 0) > 0;
  }

  broadcastState(): void {
    const state = this.store.get(this.id);
    if (state === undefined) return;
    for (const player of state.players) {
      this.transport.send(player.id, { type: 'state', view: redactStateFor(state, player.id) });
    }
  }

  #runEffects(state: RoomState, effects: readonly Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'BROADCAST_STATE':
          this.broadcastState();
          break;

        case 'CHAT':
          this.#chat(state, effect);
          break;

        case 'PRIVATE':
          this.transport.send(effect.playerId, {
            type: 'private', text: effect.text, kind: effect.kind,
          });
          break;

        case 'CLEAR_CANVAS':
          this.strokes.clear();
          for (const player of state.players) this.transport.send(player.id, { type: 'clear' });
          break;

        case 'REJECT':
          this.transport.send(effect.playerId, { type: 'error', reason: effect.reason });
          this.transport.close(effect.playerId);
          break;

        case 'DISCONNECT':
          this.transport.close(effect.playerId);
          break;

        case 'REVOKE_VOICE':
          // Implemented in the voice plan; a no-op until LiveKit is wired.
          break;
      }
    }
  }

  #chat(state: RoomState, effect: Extract<Effect, { type: 'CHAT' }>): void {
    const recipients =
      effect.scope === 'all'
        ? state.players.map((p) => p.id)
        : guessedAudience(state);

    for (const playerId of recipients) {
      this.transport.send(playerId, {
        type: 'chat', from: effect.from, text: effect.text, kind: effect.kind, scope: effect.scope,
      });
    }
  }
}

/** Correct guessers plus the drawer — the only people who already know the word. */
function guessedAudience(state: RoomState): PlayerId[] {
  if (state.phase.name !== 'drawing') return state.players.map((p) => p.id);
  return [state.phase.drawerId, ...state.phase.correct.map((c) => c.playerId)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/server test room`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/room.ts apps/server/test/unit/room.test.ts
git commit -m "feat: add room runtime that drives the reducer and executes effects"
```

---

### Task 15: WebSocket server and HTTP endpoints

**Files:**
- Create: `apps/server/src/net/connection.ts`, `apps/server/src/http.ts`, `apps/server/src/index.ts`
- Test: `apps/server/test/integration/http.test.ts`

**Interfaces:**
- Consumes: `RoomRuntime`, `MemoryRoomStore`, `clientMessageSchema`
- Produces:
  - `buildApp(deps: { store: RoomStore }): FastifyInstance` — exposes `GET /health` and `POST /api/rooms`
  - `class GameServer { constructor(port: number); start(): Promise<string>; stop(): Promise<void> }`

- [ ] **Step 1: Write the failing test**

`apps/server/test/integration/http.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRoomStore } from '../../src/rooms/store.js';
import { buildApp } from '../../src/http.js';

const app = buildApp({ store: new MemoryRoomStore() });
afterEach(async () => { /* app is reused; nothing to clean between cases */ });

describe('HTTP API', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('creates a room with default settings', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().roomId).toMatch(/^[a-z0-9]{6}$/);
  });

  it('rejects invalid settings', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/rooms', payload: { settings: { rounds: 99 } },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/server test http`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the HTTP app**

`apps/server/src/http.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_SETTINGS, roomSettingsSchema } from '@scrible/protocol';
import type { RoomStore } from './rooms/store.js';

export function buildApp(deps: { store: RoomStore }): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/rooms', async (request, reply) => {
    const body = (request.body ?? {}) as { settings?: unknown };
    const parsed = roomSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(body.settings ?? {}) });

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid-settings', issues: parsed.error.issues });
    }

    const room = deps.store.create(parsed.data);
    return { roomId: room.id };
  });

  return app;
}
```

- [ ] **Step 4: Write the connection layer and entrypoint**

`apps/server/src/net/connection.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  STROKE_BINARY_HEADER,
  clientMessageSchema,
  type ClientMessage,
  type PlayerId,
  type ServerMessage,
} from '@scrible/protocol';
import { TokenBucket } from './ratelimit.js';

export interface Connection {
  playerId: PlayerId;
  roomId: string | null;
  socket: WebSocket;
  ip: string;
  alive: boolean;
}

export function createConnection(socket: WebSocket, ip: string): Connection {
  return { playerId: randomUUID(), roomId: null, socket, ip, alive: true };
}

export function send(connection: Connection, message: ServerMessage): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return;
  connection.socket.send(JSON.stringify(message));
}

export function sendBinary(connection: Connection, frame: Uint8Array): void {
  if (connection.socket.readyState !== connection.socket.OPEN) return;
  connection.socket.send(frame, { binary: true });
}

export interface Limits {
  control: TokenBucket;
  chat: TokenBucket;
  strokes: TokenBucket;
}

export function createLimits(): Limits {
  return {
    control: new TokenBucket(20, 20),
    chat: new TokenBucket(4, 2),
    strokes: new TokenBucket(25, 25),
  };
}

/** Returns the parsed message, or null when it is malformed. Never throws. */
export function parseControl(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function isStrokeFrame(frame: Uint8Array): boolean {
  return frame.length > 1 && frame[0] === STROKE_BINARY_HEADER;
}
```

`apps/server/src/index.ts`:
```ts
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, GameEvent, PlayerId, ServerMessage } from '@scrible/protocol';
import { buildApp } from './http.js';
import { MemoryRoomStore } from './rooms/store.js';
import { RoomRuntime, type Transport } from './rooms/room.js';
import {
  createConnection,
  createLimits,
  isStrokeFrame,
  parseControl,
  send,
  sendBinary,
  type Connection,
  type Limits,
} from './net/connection.js';

const TICK_MS = 250;
const EMPTY_ROOM_GRACE_MS = 120_000;

export class GameServer {
  #store = new MemoryRoomStore();
  #runtimes = new Map<string, RoomRuntime>();
  #connections = new Map<PlayerId, { connection: Connection; limits: Limits }>();
  #emptySince = new Map<string, number>();
  #http = createServer();
  #wss = new WebSocketServer({ noServer: true });
  #timer: NodeJS.Timeout | null = null;

  constructor(private readonly port: number) {}

  async start(): Promise<string> {
    const app = buildApp({ store: this.#store });
    await app.ready();
    this.#http.on('request', (req, res) => app.server.emit('request', req, res));

    this.#http.on('upgrade', (req, socket, head) => {
      this.#wss.handleUpgrade(req, socket, head, (ws) => {
        this.#onSocket(ws, req.socket.remoteAddress ?? 'unknown');
      });
    });

    await new Promise<void>((resolve) => this.#http.listen(this.port, resolve));
    this.#timer = setInterval(() => this.#tick(), TICK_MS);

    const address = this.#http.address();
    const port = typeof address === 'object' && address !== null ? address.port : this.port;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (this.#timer !== null) clearInterval(this.#timer);
    for (const { connection } of this.#connections.values()) connection.socket.terminate();
    this.#wss.close();
    await new Promise<void>((resolve) => this.#http.close(() => resolve()));
  }

  #transport(): Transport {
    return {
      send: (playerId, message) => {
        const entry = this.#connections.get(playerId);
        if (entry !== undefined) send(entry.connection, message);
      },
      sendBinary: (playerId, frame) => {
        const entry = this.#connections.get(playerId);
        if (entry !== undefined) sendBinary(entry.connection, frame);
      },
      close: (playerId) => {
        const entry = this.#connections.get(playerId);
        entry?.connection.socket.close();
      },
    };
  }

  #runtimeFor(roomId: string): RoomRuntime | undefined {
    if (this.#store.get(roomId) === undefined) return undefined;
    let runtime = this.#runtimes.get(roomId);
    if (runtime === undefined) {
      runtime = new RoomRuntime(roomId, this.#store, this.#transport());
      this.#runtimes.set(roomId, runtime);
    }
    return runtime;
  }

  #onSocket(ws: WebSocket, ip: string): void {
    const connection = createConnection(ws, ip);
    const limits = createLimits();
    this.#connections.set(connection.playerId, { connection, limits });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.#onBinary(connection, limits, new Uint8Array(data as Buffer));
        return;
      }
      this.#onControl(connection, limits, String(data));
    });

    ws.on('close', () => {
      this.#connections.delete(connection.playerId);
      if (connection.roomId !== null) {
        this.#runtimeFor(connection.roomId)?.dispatch(
          { type: 'PLAYER_LEFT', playerId: connection.playerId },
          Date.now(),
        );
      }
    });
  }

  #onControl(connection: Connection, limits: Limits, raw: string): void {
    if (!limits.control.tryConsume(Date.now())) return;

    const message = parseControl(raw);
    if (message === null) {
      send(connection, { type: 'error', reason: 'malformed' });
      return;
    }

    if (message.type === 'join') {
      const runtime = this.#runtimeFor(message.roomId);
      if (runtime === undefined) {
        send(connection, { type: 'error', reason: 'no-such-room' });
        connection.socket.close();
        return;
      }
      connection.roomId = message.roomId;
      runtime.dispatch(
        {
          type: 'PLAYER_JOINED',
          playerId: connection.playerId,
          name: message.name,
          avatarSeed: message.avatarSeed,
          ip: connection.ip,
        },
        Date.now(),
      );
      // Replay the in-progress canvas so a late joiner sees the drawing.
      for (const frame of runtime.strokes.log()) sendBinary(connection, frame);
      return;
    }

    if (connection.roomId === null) return;
    const runtime = this.#runtimeFor(connection.roomId);
    if (runtime === undefined) return;

    const event = toEvent(message, connection.playerId);
    if (event === null) return;
    if (message.type === 'chat' && !limits.chat.tryConsume(Date.now())) return;

    runtime.dispatch(event, Date.now());
  }

  #onBinary(connection: Connection, limits: Limits, frame: Uint8Array): void {
    if (connection.roomId === null) return;
    if (!isStrokeFrame(frame)) return;
    if (!limits.strokes.tryConsume(Date.now())) return;

    const state = this.#store.get(connection.roomId);
    if (state === undefined) return;
    if (state.phase.name !== 'drawing') return;
    if (state.phase.drawerId !== connection.playerId) return;

    const runtime = this.#runtimeFor(connection.roomId);
    if (runtime === undefined) return;

    runtime.strokes.append(frame);
    for (const player of state.players) {
      if (player.id === connection.playerId) continue;
      const entry = this.#connections.get(player.id);
      if (entry !== undefined) sendBinary(entry.connection, frame);
    }
  }

  #tick(): void {
    const now = Date.now();
    for (const roomId of this.#store.ids()) {
      const runtime = this.#runtimeFor(roomId);
      runtime?.tick(now);

      if (runtime !== undefined && !runtime.hasPlayers()) {
        const since = this.#emptySince.get(roomId) ?? now;
        this.#emptySince.set(roomId, since);
        if (now - since >= EMPTY_ROOM_GRACE_MS) {
          this.#store.delete(roomId);
          this.#runtimes.delete(roomId);
          this.#emptySince.delete(roomId);
        }
      } else {
        this.#emptySince.delete(roomId);
      }
    }
  }
}

/** Maps a validated client message to a game event. Returns null for messages
 *  handled outside the reducer (join, undo, clear, pong). */
function toEvent(message: ClientMessage, playerId: PlayerId): GameEvent | null {
  switch (message.type) {
    case 'start': return { type: 'START_GAME', playerId };
    case 'settings': return { type: 'SETTINGS_CHANGED', playerId, settings: message.settings };
    case 'choose-word': return { type: 'WORD_CHOSEN', playerId, choiceIndex: message.index };
    case 'chat': return { type: 'GUESS', playerId, text: message.text };
    case 'kick': return { type: 'KICK', playerId, targetId: message.targetId, ban: message.ban };
    case 'votekick': return { type: 'VOTEKICK', playerId, targetId: message.targetId };
    default: return null;
  }
}

if (process.env['NODE_ENV'] !== 'test') {
  const server = new GameServer(Number(process.env['PORT'] ?? 3000));
  void server.start().then((url) => console.log(`scrible server listening on ${url}`));
}
```

Import `ClientMessage` from `@scrible/protocol` and use it in place of the local `ClientMessageLike` alias if TypeScript complains — the alias exists only to keep `toEvent` narrow.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C apps/server test http && pnpm -C apps/server typecheck`
Expected: PASS, 3 tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: add websocket server and HTTP room endpoints"
```

---

### Task 16: Full-game integration test

**Files:**
- Create: `apps/server/test/integration/game.test.ts`

**Interfaces:**
- Consumes: `GameServer` from Task 15
- Produces: the acceptance gate for this plan — a complete two-player game over real WebSockets

- [ ] **Step 1: Write the failing test**

`apps/server/test/integration/game.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@scrible/protocol';
import { GameServer } from '../../src/index.js';

let server: GameServer;
let baseUrl: string;

beforeAll(async () => {
  server = new GameServer(0);
  baseUrl = await server.start();
});

afterAll(async () => {
  await server.stop();
});

/** A test client that records every server message it receives. */
class Client {
  readonly received: ServerMessage[] = [];
  #socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      this.received.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  static async connect(url: string): Promise<Client> {
    const socket = new WebSocket(url.replace('http', 'ws'));
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new Client(socket);
  }

  send(message: unknown): void {
    this.#socket.send(JSON.stringify(message));
  }

  close(): void {
    this.#socket.close();
  }

  /** Wait until a matching message arrives, or fail after the timeout. */
  async waitFor<T extends ServerMessage>(
    predicate: (m: ServerMessage) => m is T,
    timeoutMs = 3_000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find(predicate);
      if (found !== undefined) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timed out waiting for message');
  }

  latestState() {
    const states = this.received.filter((m) => m.type === 'state');
    return states.at(-1);
  }
}

const isState = (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state';

async function createRoom(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { rounds: 2, drawTimeSec: 15, hints: 0 } }),
  });
  return ((await res.json()) as { roomId: string }).roomId;
}

describe('a full two-player game', () => {
  it('plays from lobby through a scored guess', async () => {
    const roomId = await createRoom();

    const ada = await Client.connect(baseUrl);
    const bo = await Client.connect(baseUrl);

    ada.send({ type: 'join', roomId, name: 'Ada', avatarSeed: 'a' });
    bo.send({ type: 'join', roomId, name: 'Bo', avatarSeed: 'b' });

    await bo.waitFor(isState);
    expect(ada.latestState()?.view.players).toHaveLength(2);

    ada.send({ type: 'start' });

    const selecting = await ada.waitFor(
      (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.view.phase.name === 'word-select',
    );

    const drawerId = selecting.view.phase.drawerId!;
    const drawer = selecting.view.players.find((p) => p.id === drawerId)!.name === 'Ada' ? ada : bo;
    const guesser = drawer === ada ? bo : ada;

    // Only the drawer receives the word choices.
    const drawerView = drawer.latestState()!;
    expect(drawerView.view.phase.choices).toBeDefined();
    expect(guesser.latestState()!.view.phase.choices).toBeUndefined();

    const secret = drawerView.view.phase.choices![0]!.text;

    drawer.send({ type: 'choose-word', index: 0 });

    await guesser.waitFor(
      (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.view.phase.name === 'drawing',
    );

    // The guesser must never have seen the secret in any frame.
    expect(JSON.stringify(guesser.received)).not.toContain(secret);

    guesser.send({ type: 'chat', text: secret });

    await guesser.waitFor(
      (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.view.phase.name === 'turn-end',
    );

    const final = guesser.latestState()!;
    const guesserId = final.view.players.find((p) => p.name === (drawer === ada ? 'Bo' : 'Ada'))!.id;
    const scored = final.view.players.find((p) => p.id === guesserId)!;

    expect(scored.score).toBeGreaterThan(0);
    expect(final.view.players.find((p) => p.id === drawerId)!.score).toBeGreaterThan(0);

    ada.close();
    bo.close();
  }, 20_000);

  it('rejects a join to a room that does not exist', async () => {
    const client = await Client.connect(baseUrl);
    client.send({ type: 'join', roomId: 'zzzzzz', name: 'Ghost', avatarSeed: 'g' });

    const error = await client.waitFor(
      (m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error',
    );
    expect(error.reason).toBe('no-such-room');
    client.close();
  });

  it('ignores a malformed frame without dropping the connection', async () => {
    const roomId = await createRoom();
    const client = await Client.connect(baseUrl);
    client.send({ type: 'join', roomId, name: 'Ada', avatarSeed: 'a' });
    await client.waitFor(isState);

    client.send({ type: 'not-a-real-message', nonsense: true });

    const error = await client.waitFor(
      (m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error',
    );
    expect(error.reason).toBe('malformed');

    // Still usable afterwards.
    client.send({ type: 'chat', text: 'still here' });
    client.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/server test game`
Expected: FAIL initially — expect to fix real wiring bugs here. This test is the point of the plan.

- [ ] **Step 3: Fix whatever the integration test exposes**

Do not weaken the test to make it pass. Common causes to check first:
- Fastify's `inject` works but the raw `http` request bridge in `GameServer#start` does not — if `/api/rooms` 404s over real HTTP, replace the `app.server.emit` bridge with `fastify` handling the listen directly and attaching `ws` to `app.server`.
- `PLAYER_JOINED` broadcasting before the joining player is registered in `#connections`.
- `Date.now()` versus the reducer's `endsAt` when `drawTimeSec` is small.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS across all packages.

- [ ] **Step 5: Commit**

```bash
git add apps/server/test/integration/game.test.ts apps/server/src
git commit -m "test: add full two-player game integration test"
```

---

### Task 17: Rejoin tokens and the single-player pause

Two spec requirements that the tasks above leave unimplemented: the signed rejoin token (spec §10) and the pause when only one player remains (spec §8).

**Files:**
- Create: `apps/server/src/net/rejoin.ts`
- Modify: `packages/protocol/src/types.ts` (add `pausedSince` to `RoomState`), `packages/protocol/src/reduce.ts` (pause handling in `tick`), `apps/server/src/index.ts` (honour `rejoinToken` on join)
- Test: `packages/protocol/test/reduce-pause.test.ts`, `apps/server/test/unit/rejoin.test.ts`

**Interfaces:**
- Consumes: `tickPhase`, `createRoom` from Task 11; `Connection` from Task 15
- Produces:
  - `mintRejoinToken(secret: string, roomId: string, playerId: string): string`
  - `verifyRejoinToken(secret: string, token: string): { roomId: string; playerId: string } | null`
  - `PAUSE_ABANDON_MS = 120_000`; `RoomState.pausedSince: number | null`

- [ ] **Step 1: Write the failing tests**

`apps/server/test/unit/rejoin.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mintRejoinToken, verifyRejoinToken } from '../../src/net/rejoin.js';

const SECRET = 'test-secret';

describe('rejoin tokens', () => {
  it('round-trips a room and player id', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    expect(verifyRejoinToken(SECRET, token)).toEqual({ roomId: 'room12', playerId: 'player-a' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    expect(verifyRejoinToken('other-secret', token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    const [payload, signature] = token.split('.');
    const forged = `${Buffer.from('room12:attacker').toString('base64url')}.${signature}`;
    expect(payload).toBeDefined();
    expect(verifyRejoinToken(SECRET, forged)).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyRejoinToken(SECRET, 'garbage')).toBeNull();
    expect(verifyRejoinToken(SECRET, '')).toBeNull();
  });
});
```

`packages/protocol/test/reduce-pause.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type RoomState } from '../src/types.js';
import { PAUSE_ABANDON_MS, createRoom, reduce, type ReducerCtx } from '../src/reduce.js';

function ctxAt(now: number): ReducerCtx {
  return {
    now,
    random: () => 0.5,
    pickWords: ({ count }) =>
      Array.from({ length: count }, () => ({ text: 'apple', difficulty: 'easy' as const })),
  };
}

/** Two players, mid-turn, then one of them leaves. */
function abandonedMidTurn(): RoomState {
  const ctx = ctxAt(0);
  let state = createRoom({ id: 'r1', settings: { ...DEFAULT_SETTINGS, hints: 0 } });
  for (const id of ['p1', 'p2']) {
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: id, name: id, avatarSeed: id, ip: id }, ctx).state;
  }
  state = reduce(state, { type: 'START_GAME', playerId: 'p1' }, ctx).state;
  const drawerId = state.phase.name === 'word-select' ? state.phase.drawerId : 'p1';
  state = reduce(state, { type: 'WORD_CHOSEN', playerId: drawerId, choiceIndex: 0 }, ctx).state;
  const other = drawerId === 'p1' ? 'p2' : 'p1';
  return reduce(state, { type: 'PLAYER_LEFT', playerId: other }, ctxAt(1_000)).state;
}

describe('single-player pause', () => {
  it('records when the pause began', () => {
    const state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    expect(state.pausedSince).toBe(2_000);
  });

  it('does not drain the drawing clock while paused', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    const before = state.phase.name === 'drawing' ? state.phase.endsAt : 0;
    state = reduce(state, { type: 'TICK' }, ctxAt(12_000)).state;
    const after = state.phase.name === 'drawing' ? state.phase.endsAt : 0;
    expect(after).toBe(before + 10_000);
  });

  it('resumes when a second player joins', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p3', name: 'Cy', avatarSeed: 'c', ip: '3.3.3.3' }, ctxAt(3_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(3_100)).state;
    expect(state.pausedSince).toBeNull();
  });

  it('ends the game when nobody returns before the abandon timeout', () => {
    let state = reduce(abandonedMidTurn(), { type: 'TICK' }, ctxAt(2_000)).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(2_000 + PAUSE_ABANDON_MS + 1)).state;
    expect(state.phase.name).toBe('game-end');
  });

  it('does not pause a lobby', () => {
    const ctx = ctxAt(0);
    let state = createRoom({ id: 'r1', settings: DEFAULT_SETTINGS });
    state = reduce(state, { type: 'PLAYER_JOINED', playerId: 'p1', name: 'A', avatarSeed: 'a', ip: 'a' }, ctx).state;
    state = reduce(state, { type: 'TICK' }, ctxAt(1_000)).state;
    expect(state.pausedSince).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C packages/protocol test reduce-pause && pnpm -C apps/server test rejoin`
Expected: FAIL — `pausedSince` and `rejoin.js` do not exist.

- [ ] **Step 3: Add the pause to the reducer**

Add `pausedSince: number | null;` to `RoomState` in `types.ts`, and `pausedSince: null` to the object `createRoom` returns.

Then wrap the tick from Task 11:
```ts
export const PAUSE_ABANDON_MS = 120_000;

/** Phases where a lone player is a problem rather than a normal state. */
function isLive(phase: RoomState['phase']): boolean {
  return phase.name !== 'lobby' && phase.name !== 'game-end';
}

function applyPause(state: RoomState, ctx: ReducerCtx): ReduceResult | null {
  const connected = state.players.filter((p) => p.connected).length;

  if (connected >= 2 || !isLive(state.phase)) {
    if (state.pausedSince === null) return null;
    return { state: { ...state, pausedSince: null }, effects: [{ type: 'BROADCAST_STATE' }] };
  }

  // Newly paused.
  if (state.pausedSince === null) {
    return { state: { ...state, pausedSince: ctx.now }, effects: [{ type: 'BROADCAST_STATE' }] };
  }

  // Paused too long — abandon the game rather than hold the room open.
  if (ctx.now - state.pausedSince >= PAUSE_ABANDON_MS) {
    return {
      state: { ...state, pausedSince: null, phase: { name: 'game-end' } },
      effects: [{ type: 'BROADCAST_STATE' }],
    };
  }

  // Still paused: push every deadline forward so no clock drains while waiting.
  const shift = ctx.now - state.pausedSince;
  const phase = state.phase;
  const shifted =
    phase.name === 'drawing'
      ? { ...phase, endsAt: phase.endsAt + shift, startedAt: phase.startedAt + shift }
      : 'endsAt' in phase
        ? { ...phase, endsAt: phase.endsAt + shift }
        : phase;

  return { state: { ...state, pausedSince: ctx.now, phase: shifted }, effects: [] };
}
```

Call it at the top of `tick`, after seat reaping and before `tickPhase`. When `applyPause` returns non-null **and** the room is still paused (`result.state.pausedSince !== null`), return its result directly and skip `tickPhase` — a paused game must not advance phases:

```ts
  const paused = applyPause(state, ctx);
  if (paused !== null) {
    state = paused.state;
    reaped.push(...paused.effects);
    if (state.pausedSince !== null) return { state, effects: reaped };
  }
```

- [ ] **Step 4: Write the rejoin token module**

`apps/server/src/net/rejoin.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A rejoin token is `base64url(roomId:playerId).base64url(hmac)`. It carries no
 * secrets of its own — it only proves the server issued this seat to this
 * client, so a reconnecting player can reclaim their score.
 */
export function mintRejoinToken(secret: string, roomId: string, playerId: string): string {
  const payload = Buffer.from(`${roomId}:${playerId}`).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyRejoinToken(
  secret: string,
  token: string,
): { roomId: string; playerId: string } | null {
  const [payload, signature] = token.split('.');
  if (payload === undefined || signature === undefined) return null;

  const expected = Buffer.from(sign(secret, payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  const decoded = Buffer.from(payload, 'base64url').toString();
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;

  return {
    roomId: decoded.slice(0, separator),
    playerId: decoded.slice(separator + 1),
  };
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
```

- [ ] **Step 5: Honour the token on join**

In `GameServer`, read the secret once: `readonly #secret = process.env['REJOIN_SECRET'] ?? randomUUID();`. A per-process fallback is correct — tokens should not survive a restart, because the rooms they point at do not either.

In the `join` branch of `#onControl`, before dispatching `PLAYER_JOINED`:

```ts
      const claim =
        message.rejoinToken !== undefined
          ? verifyRejoinToken(this.#secret, message.rejoinToken)
          : null;

      const seat =
        claim !== null && claim.roomId === message.roomId
          ? this.#store.get(message.roomId)?.players.find((p) => p.id === claim.playerId)
          : undefined;

      if (seat !== undefined && !seat.connected) {
        // Reclaim the existing seat, score and all.
        this.#connections.delete(connection.playerId);
        connection.playerId = claim!.playerId;
        this.#connections.set(connection.playerId, { connection, limits });
        connection.roomId = message.roomId;
        runtime.dispatch({ type: 'PLAYER_RECONNECTED', playerId: connection.playerId }, Date.now());
        for (const frame of runtime.strokes.log()) sendBinary(connection, frame);
        return;
      }
```

Change `Connection.playerId` from `readonly` to mutable in `connection.ts` so the reclaim above can reassign it.

Send the token in the join acknowledgement so the client can store it:
```ts
      send(connection, {
        type: 'welcome',
        playerId: connection.playerId,
        rejoinToken: mintRejoinToken(this.#secret, message.roomId, connection.playerId),
        view: redactStateFor(this.#store.get(message.roomId)!, connection.playerId),
      });
```
Place this immediately after the `PLAYER_JOINED` dispatch, and after the reconnect dispatch in the reclaim branch.

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS across all packages, including the new pause and rejoin suites.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol apps/server
git commit -m "feat: add signed rejoin tokens and single-player pause"
```

---

## Acceptance Criteria

This plan is done when all of the following hold:

- [ ] `pnpm test` passes from the repository root, covering every package.
- [ ] `pnpm typecheck` passes with zero errors.
- [ ] The integration test in Task 16 plays a complete turn and asserts the guesser never received the secret word.
- [ ] `packages/protocol` imports nothing but `zod` — verify with `grep -rn "^import" packages/protocol/src | grep -v "from './" | grep -v "from 'zod'"` returning nothing.
- [ ] The word list has 300+ original entries and the duplicate test passes.
- [ ] A reconnecting player reclaims their seat and score via a rejoin token.
- [ ] A game with one connected player pauses without draining its clock, and abandons after 120s.

## Spec Coverage

Every requirement in `docs/superpowers/specs/2026-08-06-scrible-design.md`, and where it lands:

| Spec section | Covered by |
|---|---|
| §2 lobby settings | Task 6 |
| §2 game modes | Tasks 5, 8 |
| §2 drawing tools | **Plan 2** (client-side) |
| §2 guessing, close-match, guessed-only channel | Tasks 3, 10, 14 |
| §2 room ops: kick, ban, votekick | Task 11 |
| §3 authority rule | Task 7, enforced by Tasks 14 and 16 |
| §4 repository layout | Tasks 1, 8, 13 |
| §5 server modules | Tasks 13, 14, 15 — except `VoiceTokens` (**Plan 3**) |
| §6 state machine | Tasks 9, 10, 11 |
| §7 wire protocol, replay log, rate limits | Tasks 12, 13, 15 |
| §8 scoring and edge cases | Tasks 4, 10, 11, 17 |
| §9 voice chat | **Plan 3** |
| §10 error handling and reconnect | Tasks 11, 15, 17 |
| §11 UI direction | **Plan 2** |
| §12 deployment | **Plan 3** |
| §13 testing strategy | Every task; acceptance gate in Task 16 |

## Next Plans

- **Plan 2 — Web client:** canvas engine, lobby and game screens, design pass with the `frontend-design` skill.
- **Plan 3 — Voice and deploy:** LiveKit token endpoint, client publish/subscribe, speaking-ring HUD, `REVOKE_VOICE` implementation, Fly.io configuration.
