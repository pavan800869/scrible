import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomSettings } from '@scrible/protocol';
import { CanvasEngine } from './canvas/engine.js';
import { GameClient } from './net/client.js';
import { Game } from './screens/Game.js';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { Podium } from './screens/Podium.js';
import { readRejoinToken, useGame, writeRejoinToken } from './state/store.js';
import { useVoice } from './voice/useVoice.js';

/** Room code lives in the URL hash, so an invite link is just the page URL. */
function roomFromHash(): string | null {
  const match = /^#\/r\/([a-z0-9]{4,16})$/i.exec(window.location.hash);
  return match?.[1]?.toLowerCase() ?? null;
}

export function App() {
  const state = useGame();
  const engine = useMemo(() => new CanvasEngine(), []);
  const clientRef = useRef<GameClient | null>(null);

  const [rejoinToken, setRejoinToken] = useState<string | null>(null);
  const voice = useVoice({ roomId: state.roomId, rejoinToken });

  // One client for the life of the app. Handlers read from refs, never stale props.
  if (clientRef.current === null) {
    clientRef.current = new GameClient({
      onWelcome: (playerId, token, view) => {
        useGame.getState().setIdentity(playerId, view.id);
        useGame.getState().setView(view);
        writeRejoinToken(view.id, token);
        setRejoinToken(token);
      },
      onView: (view) => useGame.getState().setView(view),
      onChat: (entry) => useGame.getState().addChat(entry),
      onStroke: (frame) => engine.commit(frame),
      onClear: () => engine.clear(),
      onUndo: (strokeCount) => engine.truncate(strokeCount),
      onStatus: (status, reason) => useGame.getState().setStatus(status, reason),
    });
  }

  const client = clientRef.current;

  const join = useCallback(
    (roomId: string) => {
      window.location.hash = `#/r/${roomId}`;
      engine.clear();
      client.connect({
        roomId,
        name: useGame.getState().name,
        avatarSeed: useGame.getState().avatarSeed,
        rejoinToken: readRejoinToken(roomId),
      });
    },
    [client, engine],
  );

  // Deep link: joining straight from an invite URL, once a name exists.
  useEffect(() => {
    const roomId = roomFromHash();
    if (roomId !== null && state.view === null && state.status === 'idle' && state.name.length > 0) {
      join(roomId);
    }
  }, [join, state.view, state.status, state.name]);

  const createRoom = useCallback(async (): Promise<string> => {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as { roomId: string };
    return body.roomId;
  }, []);

  const leave = useCallback(() => {
    voice.leave();
    client.disconnect();
    window.location.hash = '';
    useGame.getState().reset();
    engine.clear();
  }, [client, engine, voice]);

  const view = state.view;

  if (view === null) {
    return (
      <Home
        name={state.name}
        avatarSeed={state.avatarSeed}
        error={state.status === 'error' ? state.errorReason : null}
        onProfile={(name, seed) => state.setProfile(name, seed)}
        onJoin={join}
        onCreate={createRoom}
      />
    );
  }

  if (view.phase.name === 'lobby') {
    return (
      <Lobby
        view={view}
        selfId={state.playerId}
        voice={voice}
        onSettings={(settings: RoomSettings) => client.send({ type: 'settings', settings })}
        onStart={() => client.send({ type: 'start' })}
        onKick={(targetId) => client.send({ type: 'kick', targetId, ban: false })}
      />
    );
  }

  if (view.phase.name === 'game-end') {
    return (
      <Podium
        view={view}
        selfId={state.playerId}
        onPlayAgain={() => client.send({ type: 'start' })}
        onLeave={leave}
      />
    );
  }

  return (
    <Game
      view={view}
      selfId={state.playerId}
      engine={engine}
      chat={state.chat}
      voice={voice}
      onFrame={(frame) => client.sendStroke(frame)}
      onChat={(text) => client.send({ type: 'chat', text })}
      onPickWord={(index) => client.send({ type: 'choose-word', index })}
      onUndo={() => client.send({ type: 'undo' })}
      onClear={() => client.send({ type: 'clear' })}
      onKick={(targetId) => client.send({ type: 'kick', targetId, ban: false })}
    />
  );
}
