import { useEffect, useRef, useState } from 'react';
import type { ClientRoomView } from '@scrible/protocol';
import { DrawingCanvas } from '../canvas/DrawingCanvas.js';
import type { CanvasEngine } from '../canvas/engine.js';
import { Character } from '../components/Character.js';
import { Chat } from '../components/Chat.js';
import { Confetti } from '../components/Confetti.js';
import { Roster } from '../components/Roster.js';
import { Timer } from '../components/Timer.js';
import { Toolbar, type Tool } from '../components/Toolbar.js';
import { VoiceControls } from '../components/VoiceControls.js';
import { WordMask } from '../components/WordMask.js';
import { WordPicker } from '../components/WordPicker.js';
import type { ChatEntry } from '../net/client.js';
import type { VoiceApi } from '../voice/useVoice.js';

interface GameProps {
  view: ClientRoomView;
  selfId: string | null;
  engine: CanvasEngine;
  chat: ChatEntry[];
  voice: VoiceApi;
  typing: string[];
  onFrame: (frame: Uint8Array) => void;
  onChat: (text: string) => void;
  onTyping: (on: boolean) => void;
  onPickWord: (index: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onKick: (playerId: string) => void;
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E\")";

export function Game(props: GameProps) {
  const { view, selfId } = props;
  const phase = view.phase;

  const [tool, setTool] = useState<Tool>('brush');
  const [colorIndex, setColorIndex] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(1);

  const isDrawer = phase.drawerId === selfId;
  const isDrawing = phase.name === 'drawing';
  const hasGuessed = (phase.correctPlayerIds ?? []).includes(selfId ?? '');
  const canDraw = isDrawer && isDrawing;

  // Confetti fires on the edge where you go from guessing to having it.
  const [burst, setBurst] = useState(0);
  const wasCorrect = useRef(false);
  useEffect(() => {
    if (hasGuessed && !wasCorrect.current) setBurst((n) => n + 1);
    wasCorrect.current = hasGuessed;
  }, [hasGuessed]);

  // Tool shortcuts. Suppressed while the guess box has focus, so typing "clear"
  // never wipes the canvas.
  useEffect(() => {
    if (!canDraw) return;

    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'b': setTool('brush'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('fill'); break;
        case 'u': props.onUndo(); break;
        case 'c': props.onClear(); break;
        case '1': setSizeIndex(0); break;
        case '2': setSizeIndex(1); break;
        case '3': setSizeIndex(2); break;
        case '4': setSizeIndex(3); break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDraw, props]);

  const drawTimeMs = view.settings.drawTimeSec * 1000;
  const phaseTotal =
    phase.name === 'drawing' ? drawTimeMs : phase.name === 'word-select' ? 15_000 : 6_000;

  const drawerName = view.players.find((p) => p.id === phase.drawerId)?.name ?? 'Someone';

  const drawerSeed = view.players.find((p) => p.id === phase.drawerId)?.avatarSeed ?? '';

  return (
    <div className="shell">
      <Confetti trigger={burst} />

      <header className="topbar">
        <div className="topbar-left">
          {phase.endsAt !== undefined && (
            <Timer endsAt={phase.endsAt} totalMs={phaseTotal} paused={view.paused} />
          )}
          <span className="round-chip">
            Round {view.round} of {view.settings.rounds}
          </span>
        </div>

        <WordMask mask={phase.mask} word={phase.word} />

        <div className="topbar-right">
          {view.paused && <span className="banner">Paused — waiting for players</span>}
          <VoiceControls voice={props.voice} />
        </div>
      </header>

      <div className="stage">
        <Roster
          view={view}
          selfId={selfId}
          speaking={props.voice.speaking}
          onKick={props.onKick}
        />

        <div className="easel">
          <div className="paper-wrap">
            <div className={`paper${canDraw ? ' is-yours' : ''}`}>
              <DrawingCanvas
                engine={props.engine}
                enabled={canDraw}
                tool={tool}
                colorIndex={colorIndex}
                sizeIndex={sizeIndex}
                onFrame={props.onFrame}
              />
              <div className="paper-grain" style={{ backgroundImage: GRAIN }} />

              {phase.name === 'word-select' && isDrawer && phase.choices !== undefined && (
                <WordPicker choices={phase.choices} onPick={props.onPickWord} />
              )}

              {phase.name === 'word-select' && !isDrawer && (
                <div className="paper-veil">
                  <Character seed={drawerSeed} mood="thinking" size={96} />
                  <p className="veil-title">{drawerName} is picking a word</p>
                  <p className="setting-hint">Get your typing fingers ready.</p>
                </div>
              )}

              {phase.name === 'turn-end' && (
                <div className="paper-veil">
                  <Character
                    seed={drawerSeed}
                    mood={(phase.correctPlayerIds ?? []).length > 0 ? 'happy' : 'sad'}
                    size={96}
                  />
                  <p className="veil-title">The word was</p>
                  <p className="veil-word">{phase.word}</p>
                </div>
              )}

              {phase.name === 'round-end' && (
                <div className="paper-veil">
                  <p className="veil-title">End of round {view.round}</p>
                  <p className="setting-hint">Next round starting…</p>
                </div>
              )}
            </div>
          </div>

          {canDraw && (
            <Toolbar
              tool={tool}
              colorIndex={colorIndex}
              sizeIndex={sizeIndex}
              onTool={setTool}
              onColor={setColorIndex}
              onSize={setSizeIndex}
              onUndo={props.onUndo}
              onClear={props.onClear}
            />
          )}
        </div>

        <Chat
          entries={props.chat}
          disabled={false}
          placeholder={
            isDrawer
              ? "You're drawing — no spoilers"
              : hasGuessed
                ? 'Chat with the others who guessed'
                : 'Type your guess'
          }
          onSend={props.onChat}
          nameOf={(id) => view.players.find((p) => p.id === id)?.name ?? 'Someone'}
          typing={props.typing}
          onTyping={props.onTyping}
        />
      </div>
    </div>
  );
}
