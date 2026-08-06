# scrible

A multiplayer drawing-and-guessing game with group voice chat. Draw a word, everyone else races to type it, the clock pays out fewer points the longer it takes.

## Run it

```bash
pnpm install
pnpm -C apps/server dev     # game server on :3000
pnpm -C apps/web dev        # client on :5173, proxies /api and /ws
```

Open http://localhost:5173, pick a name, start a game, and share the URL. The room code lives in the hash, so the invite link is just the page URL.

Voice needs LiveKit credentials (below). Without them the game runs text-only and says so — nothing breaks.

## Layout

```
packages/protocol   Game rules as a pure reducer. Zero deps but zod.
packages/words      330 words with difficulty ratings.
apps/server         Fastify + ws. Authoritative. Owns all room state.
apps/web            React + Vite. Canvas2D drawing, LiveKit voice.
```

`packages/protocol` holds the entire game as `reduce(state, event, ctx) → { state, effects }`. It never touches the clock, the network, or `Math.random` — `ctx` injects `now` and `random`. That is why 102 of the tests run without a socket, a browser, or a timer.

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
pnpm test        # 154 tests
pnpm typecheck
```

## Deploying

```bash
fly launch --no-deploy
fly secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... REJOIN_SECRET=$(openssl rand -hex 32)
fly deploy
```

**Known limitation:** rooms live in process memory, so a redeploy or crash drops every live game, and the app must run on exactly one machine. `fly.toml` pins it there deliberately. `RoomStore` is an interface — moving to Redis is one new implementation, not a rewrite.

## Design

"Studio at night." The canvas is a lit sheet of paper on a dark desk; everything else recedes into the room. One warm lamp is the only accent. Type is a system stack — SF Pro for UI, SF Pro Rounded for display, monospace for the word mask so blanks read as letter slots. Dark-first, with a light theme derived from the same tokens, and `prefers-reduced-motion` respected throughout.
