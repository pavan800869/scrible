# scrible

A multiplayer drawing-and-guessing game with group voice chat. Draw a word, everyone else races to type it, the clock pays out fewer points the longer it takes.

## Run it

```bash
pnpm install
cp .env.example .env        # paste LiveKit keys here if you want voice
pnpm -C apps/server dev     # game server on :3000
pnpm -C apps/web dev        # client on :5173, proxies /api and /ws
```

Open http://localhost:5173, pick a name, start a game, and share the URL. The room code lives in the hash, so the invite link is just the page URL.

The server tells you on startup whether voice is wired up:

```
scrible listening on http://127.0.0.1:3000
voice: off — set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env to enable it
```

Without credentials the game runs text-only and says so. Nothing breaks.

`.env` is gitignored and never leaves your machine. Deployed instances read their host's secrets instead.

## Chat

Text chat runs in the lobby and in game, with live typing indicators in both.

Typing is deliberately routed around the reducer — it is presence, not game state, so it is never persisted and never replayed to a reconnecting player. The message carries a single boolean and never the draft text, so a guess in progress cannot leak through it, and the server never echoes a typing flag back to its sender.

During a turn, players who have already guessed are moved to a side channel visible only to each other and the drawer, so they cannot spoil it for anyone still guessing.

A guess within an edit distance of two of the answer comes back as a private "so close" line, visible only to the guesser. The near-miss itself is never broadcast, so being close costs you nothing and tells the room nothing.

## Likes and dislikes

While a drawing is live, everyone but the drawer can rate it. Each player holds one vote, pressing the same button again withdraws it, and the tally settles into the drawer's score at the end of the turn — 15 points a vote, clamped to +105 and −45.

The clamp is deliberately lopsided: a room that loves your drawing can lift you further than a couple of griefers can drag you down. Applause only pays when somebody actually guessed, so a turn nobody solved still scores zero, and the drawer's award never goes negative.

Only the tallies are broadcast. Who voted which way stays on the server, so a room cannot turn on whoever downvoted.

## Layout

```
packages/protocol   Game rules as a pure reducer. Zero deps but zod.
packages/words      330 words with difficulty ratings.
apps/server         Fastify + ws. Authoritative. Owns all room state.
apps/web            React + Vite. Canvas2D drawing, LiveKit voice.
```

`packages/protocol` holds the entire game as `reduce(state, event, ctx) → { state, effects }`. It never touches the clock, the network, or `Math.random` — `ctx` injects `now` and `random`. That is why 132 of the tests run without a socket, a browser, or a timer.

## The one rule that matters

**The server never sends the word to a player who has not guessed it.** Not encrypted, not masked client-side — absent from the payload. Guessers receive only the mask pattern and which indices have been revealed. Hint scheduling, guess matching, and scoring all happen server-side.

Every outbound payload goes through `redactStateFor()`. An integration test asserts that a guesser's entire received message history never contains the secret, so opening DevTools tells you nothing.

## Voice

LiveKit Cloud (or self-hosted) provides the SFU. Set:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

The API secret stays server-side; it signs access tokens and nothing else. Authorisation for a voice token is the signed rejoin token the server already issued over the socket — proof you hold a real seat. Identity is pinned to the server-issued player id, so nobody can join the audio room as someone else. A host kick revokes the LiveKit token server-side, so a removed player is ejected from the call, not just the UI.

Spoken guesses do not score. Only text chat is evaluated.

The LiveKit SDK is a lazy import — players who never turn on voice never download the 554 kB chunk.

## Testing

```bash
pnpm test        # 187 tests
pnpm typecheck
```

## Deploying

Two blueprints are in the repo — use one, ignore the other.

**Render** (`render.yaml`) — connect the repo at dashboard.render.com → New → Blueprint. It prompts for the three LiveKit secrets and redeploys on every push. Nearest region to India is Singapore. The free tier sleeps after 15 minutes idle, which drops any game in progress, so use Starter for a link you actually share.

**Fly** (`fly.toml`) — lower latency from Mumbai, never sleeps:

```bash
fly launch --no-deploy
fly secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... REJOIN_SECRET=$(openssl rand -hex 32)
fly deploy
```

**Known limitation:** rooms live in process memory, so a redeploy or crash drops every live game, and the app must run on exactly one machine. `fly.toml` pins it there deliberately. `RoomStore` is an interface — moving to Redis is one new implementation, not a rewrite.

## Design

"Studio at night." The canvas is a lit sheet of paper on a dark desk; everything else recedes into the room. One warm lamp is the only accent. Type is a system stack — SF Pro for UI, SF Pro Rounded for display, monospace for the word mask so blanks read as letter slots. Dark-first, with a light theme derived from the same tokens, and `prefers-reduced-motion` respected throughout.
