# scrible — Multiplayer Drawing & Guessing Game with Voice Chat

**Date:** 2026-08-06
**Status:** Approved design, ready for implementation planning

## 1. Purpose

Build an original multiplayer drawing-and-guessing web game in the genre established by skribbl.io, with real-time group voice chat as a first-class feature. Game mechanics follow the established genre conventions; all code, UI, and content are original.

### Explicitly out of scope for v1

- Public room matchmaking / random-room queue
- Multi-language word lists (English only in v1)
- Persistent accounts, stats, or leaderboards
- Mobile native apps (responsive web only)

### Content and originality constraints

- The word list is written from scratch, with our own difficulty ratings and categories. No word data is copied from any existing game.
- No visual asset, stylesheet, layout, or markup is derived from skribbl.io. The UI direction is deliberately divergent (see §9).
- Only the game rules and mechanics are shared with the genre, which are not protectable subject matter.

## 2. Feature Inventory

Gathered from research of the genre-defining implementation, to be reimplemented originally.

### Lobby / room settings

| Setting | Range | Default |
|---|---|---|
| Players | 2–20 | — |
| Rounds | 2–10 | 3 |
| Draw time | 15–240s (stepped) | 80s |
| Word choices offered | 1–5 | 3 |
| Hints revealed | 0–5 | 2 |
| Game mode | Normal / Hidden / Combination | Normal |
| Custom words | free-text list, optional exclusive mode | off |

Draw-time steps: 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240.

### Game modes

- **Normal** — one word; letter hints reveal progressively as the timer runs down.
- **Hidden** — one word; only the blank/`?` mask is ever shown. No letters reveal, regardless of the hint setting.
- **Combination** — two words drawn and guessed as a single phrase. Hint budget is shared across both words.

### Drawing tools

Brush, fill bucket, eraser, undo, clear, colour palette, brush-size selector.

Keyboard shortcuts: `B` brush, `F` fill, `E` eraser, `U` undo, `C` clear, `S` swap to previous colour, `1`–`4` brush sizes.

### Guessing

- Exact match (after normalization) scores.
- A guess within Levenshtein distance 2 of the word returns a private "close!" notice to that player only, and is not broadcast to the room.
- Players who have already guessed correctly are moved into a guessed-only side channel, visible to other correct guessers and the drawer, so they cannot leak the answer.
- The drawer's chat messages are filtered: any message containing the word or a near-match is blocked with a private warning.

### Room operations

Invite link, host kick, host ban (for the room's lifetime), votekick (majority of connected non-target players), per-player local mute, report.

**Ban enforcement.** With anonymous identity there is no durable account to ban. A ban is keyed to the player's session ID *and* their source IP, held in the room's memory for the room's lifetime only. This stops casual return but not a determined rejoiner on a new address. That is an accepted limit of the anonymous model, not an oversight; kick plus votekick is the practical remedy.

## 3. Architecture

Single authoritative Node game server. One Fastify process serves the built SPA over HTTP, mints LiveKit tokens, and upgrades WebSocket connections on the same port. LiveKit Cloud provides the SFU, TURN, and edge relays for voice.

```
Browser (React SPA)
  │
  ├── WebSocket (game protocol) ──► Fastify + ws ──► Room state machine (in-memory)
  │                                      │
  │                                      └── mints scoped JWT
  │
  └── WebRTC (audio) ─────────────► LiveKit Cloud SFU
```

### Authority rule

**The server is the sole authority, and guessers never receive the word over the wire in any form.** Not encrypted, not masked, not obfuscated. The client receives only the mask pattern and the set of already-revealed indices. Hint scheduling, guess matching, and scoring are computed server-side. This eliminates the entire class of cheating available by inspecting client state or network frames — the defining weakness of naive implementations of this genre.

## 4. Repository Layout

pnpm workspace monorepo, TypeScript throughout, at the repository root (no nested project folder).

```
scrible/
├── apps/
│   ├── web/         React 19 + Vite SPA
│   └── server/      Fastify + ws game server
├── packages/
│   ├── protocol/    shared message types, state machine, scoring
│   └── words/       original word list + difficulty data
├── docs/superpowers/specs/
├── fly.toml
└── pnpm-workspace.yaml
```

`packages/protocol` is the keystone: it holds the zod message schemas, the pure state-machine reducer, and the scoring math. Both apps import it. Because it is pure and dependency-free, the entire game is unit-testable without a socket, a browser, or a timer.

## 5. Server Modules

Each module has one responsibility, a narrow interface, and no knowledge of transport.

| Module | Responsibility | Depends on |
|---|---|---|
| `RoomStore` | Interface + in-memory implementation. Create, look up, and reap rooms. The seam for a future Redis backend. | — |
| `Room` | Drives the state machine, owns the player roster, handles host migration and reaping. | `RoomStore`, `protocol` |
| `TurnEngine` | Turn order, word-choice offers, per-phase timers. | `protocol`, `words` |
| `GuessMatcher` | Normalize, exact-match, near-match detection. | `protocol` |
| `HintScheduler` | Computes which character indices reveal at which tick, per mode and hint budget. | `protocol` |
| `ScoreEngine` | Pure scoring math. No I/O, no clock. | `protocol` |
| `StrokeRelay` | Batches and fans out stroke frames; maintains the per-turn replay log. | — |
| `VoiceTokens` | Mints scoped LiveKit JWTs; revokes participants on kick or ban. | LiveKit server SDK |
| `Connection` | Per-socket lifecycle: auth, zod validation, rate limiting, heartbeat. | `protocol` |

### Reaping

A room with zero connected players is destroyed after 120 seconds. This is the only garbage-collection mechanism the in-memory store needs.

## 6. Game State Machine

```
lobby ──► word-select ──► drawing ──► turn-end ──► round-end ──► game-end
             ▲                            │            │            │
             └────────────────────────────┘            │            │
                    (next player's turn)                │            │
             ▲──────────────────────────────────────────┘            │
                    (next round, turn order reshuffles)              │
lobby ◄──────────────────────────────────────────────────────────────┘
                    (host starts a new game, same room)
```

Implemented as `reduce(state, event) → { state, effects[] }`. Effects are declarative descriptions of side effects (broadcast this, start that timer), which the `Room` module executes. The reducer itself never touches the clock or the network, so tests drive it by feeding synthetic tick events.

### Phase details

- **lobby** — host adjusts settings; needs ≥2 connected players to start.
- **word-select** — the drawer is offered N words (per the word-count setting). A 15-second timeout auto-picks a random offer.
- **drawing** — the timer runs; strokes relay; guesses evaluate. Ends when the timer expires or every non-drawer has guessed.
- **turn-end** — reveal the word, show per-player point deltas, hold 6 seconds.
- **round-end** — running scoreboard, hold 6 seconds.
- **game-end** — final podium; host may restart into `lobby` with the same room and settings.

Turn order shuffles once per round so the same player is not consistently first.

## 7. Wire Protocol

Two frame types over one WebSocket.

**Control frames** — JSON, zod-validated at the boundary in both directions. A discriminated union on `type`. Malformed frames are dropped and count against the sender's rate limit; they never throw into the room loop.

**Stroke frames** — binary. Pointer samples are batched client-side every 50 ms and encoded as `Int16Array` coordinates on a fixed 1000×600 logical canvas. The client scales to that logical space, so all participants see identical geometry regardless of viewport.

### Replay log

`StrokeRelay` appends each committed stroke to the current turn's log. A late joiner or a reconnecting player receives the log and replays it, so the canvas is never blank. `clear` truncates the log to empty; `undo` pops the last stroke and broadcasts a truncation index rather than a full repaint.

### Rate limits

Strokes: 25 batches/sec/socket. Chat: 4 messages per 2 seconds. Control: 20/sec. Exceeding a limit drops the frame; sustained excess disconnects the socket.

## 8. Scoring

Original formula, shaped to the genre's feel.

**Guesser:**

```
raw   = 100 + floor(300 × timeRemaining / drawTime)
score = floor(raw × difficultyMultiplier)
```

Difficulty multiplier: easy 1.0, medium 1.15, hard 1.3.

**Drawer:**

```
guessedFraction = correctGuessers / (connectedPlayers - 1)
score           = min(350, floor(mean(guesserScores) × guessedFraction))
```

**Edge cases:**

- Drawer disconnects mid-turn → the turn voids; nobody scores, including prior correct guessers.
- Nobody guesses → nobody scores.
- Only one player remains connected → the game pauses in place; it resumes when a second player joins, or ends if none does within 120 seconds.
- **Clock acceleration:** on the first correct guess, the remaining time is clamped to `min(remaining, 30s)`. This prevents dead air after the word is effectively solved, while leaving slower guessers a real window.

## 9. Voice Chat

LiveKit Cloud SFU. The client uses `livekit-client` directly rather than the prebuilt component library, so the voice affordances are ours and match the surrounding design.

**Token minting.** Joining a game room mints a JWT scoped to `room:<roomId>`, with `identity` pinned to the server-issued player ID. Identity is never client-supplied, so a player cannot claim another's seat in the audio room.

**Publishing.** Mic publishes with echo cancellation, noise suppression, and auto-gain enabled. Push-to-talk is opt-in (hold `Space`, suppressed while the chat input is focused).

**Moderation.** A host kick or ban revokes the LiveKit token server-side via the LiveKit server SDK, so a removed player is ejected from audio, not merely from the game UI. Per-player local volume and local mute are client-side and do not require server round-trips.

**UI.** Voice is not a separate panel. Each player's scoreboard avatar carries a speaking ring driven by the LiveKit audio-level event. This keeps the mental model — "these are the people in the room" — in one place.

**Degradation.** Denied or unavailable mic permission puts the player in listen-only mode with a clear, non-blocking retry affordance. Voice failure never prevents playing the game; text chat is always available and always the authoritative channel for guesses.

**Guess integrity.** Spoken guesses do not score. Only text chat is evaluated. This is stated in the UI so the rule is not a surprise.

## 10. Error Handling and Resilience

| Failure | Behaviour |
|---|---|
| Player disconnects | Seat held 60s. A signed rejoin token restores seat, score, and guessed-state. |
| Reconnect after 60s | Rejoins as a new player with zero score; may not draw until the next round. |
| Host disconnects | Host migrates to the longest-connected remaining player. |
| Drawer disconnects | Turn voids (see §8), advance to the next drawer. |
| Word-select timeout | Auto-pick a random offered word. |
| LiveKit unreachable | Game proceeds fully; voice HUD shows a disconnected state and retries with backoff. |
| Token expiry | Client refreshes the LiveKit token before expiry via an authenticated HTTP endpoint. |
| Malformed client frame | Drop, count against rate limit, never throw into the room loop. |
| Server restart | **Live games are lost.** Accepted for v1; see §12. |

## 11. UI Direction

Detailed at implementation time using the `frontend-design` skill. Direction fixed here:

- **Canvas-forward.** The drawing surface dominates; every other element is deferential to it. Chat, scoreboard, and tools frame the canvas without competing with it.
- **Type** in an SF-first system stack, with clear hierarchy and generous line height.
- **Depth from layered translucency and soft shadow**, not from borders and hard outlines.
- **Motion** via spring physics on state transitions, honouring `prefers-reduced-motion` throughout.
- **Colour** comes almost entirely from two sources: the drawing itself, and per-player identity accents. The chrome stays near-neutral so the artwork is the only saturated thing on screen.
- **Dark-first**, with a light theme derived from the same tokens.
- Deliberately unlike the reference implementation's dense, high-chroma, chunky-type look.

Accessibility is not deferred: full keyboard operation of the drawing tools, visible focus rings, ARIA live regions for guesses and turn transitions, and contrast ratios meeting WCAG AA.

## 12. Deployment

Fly.io, single machine, single region, `min_machines_running = 1` and autoscaling disabled — required, because room state is in process memory. Fastify serves the built SPA and the WebSocket endpoint from the same origin, so there is one deployable and no CORS surface.

LiveKit Cloud supplies the SFU. Secrets (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`) are Fly secrets, never committed. The LiveKit API secret is used only server-side for token minting and moderation; it is never sent to the browser.

**Known limitation:** a redeploy or a crash drops all live games. This is the accepted cost of the in-memory design for v1. The `RoomStore` interface is the mitigation — moving to Redis is one new implementation of an existing interface, not a rewrite. Revisit when concurrent rooms or deploy frequency make it painful.

## 13. Testing Strategy

Test-driven throughout, per `superpowers:test-driven-development`.

- **Unit (Vitest).** `ScoreEngine`, `GuessMatcher`, `HintScheduler`, and the state-machine reducer. All pure, no clock, no sockets, fast. This is where the bulk of the coverage lives, and it is possible precisely because §4 keeps this logic in a dependency-free package.
- **Integration (Vitest).** Boot the server in-process, connect real WebSocket clients, and drive a complete two-player game: create, join, select, draw, guess, score, advance, finish. Reconnect and host-migration paths get their own scenarios.
- **End-to-end (Playwright).** Create-room → join in a second context → draw → guess → score. One happy path, kept fast.
- **Voice.** Smoke-tested against a synthetic `MediaStream`. Token minting and revocation are unit-tested against the LiveKit SDK. No real audio devices in CI.

## 14. Build Order

1. `packages/protocol` — types, reducer, scoring. Fully tested before anything consumes it.
2. `packages/words` — original word list with difficulty and category data.
3. `apps/server` — room lifecycle, protocol handling, integration-tested against real sockets.
4. `apps/web` — canvas engine, then game screens, then design pass.
5. Voice — token endpoint, then client publish/subscribe, then the HUD.
6. Deploy — Fly config, secrets, smoke test against the live deployment.

Voice lands after a playable text-only game exists. It is the highest-risk component, and debugging it is far easier against a game that already works.
