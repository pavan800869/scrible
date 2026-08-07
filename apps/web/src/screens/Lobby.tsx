import { useState } from 'react';
import { DRAW_TIME_STEPS, type ClientRoomView, type RoomSettings } from '@scrible/protocol';
import { Roster } from '../components/Roster.js';
import { Chat } from '../components/Chat.js';
import { Icon } from '../components/Icon.js';
import { VoiceControls } from '../components/VoiceControls.js';
import type { ChatEntry } from '../net/client.js';
import type { VoiceApi } from '../voice/useVoice.js';

interface LobbyProps {
  view: ClientRoomView;
  selfId: string | null;
  voice: VoiceApi;
  chat: ChatEntry[];
  typing: string[];
  onSettings: (settings: RoomSettings) => void;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onChat: (text: string) => void;
  onTyping: (on: boolean) => void;
}

const MODES: { value: RoomSettings['mode']; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Letters reveal as the clock runs down.' },
  { value: 'hidden', label: 'Hidden', hint: 'Length only. No letters, ever.' },
  { value: 'combination', label: 'Combination', hint: 'Two words at once. Good luck.' },
];

export function Lobby({
  view,
  selfId,
  voice,
  chat,
  typing,
  onSettings,
  onStart,
  onKick,
  onChat,
  onTyping,
}: LobbyProps) {
  const isHost = view.hostId === selfId;
  const settings = view.settings;
  const connected = view.players.filter((p) => p.connected).length;
  const canStart = isHost && connected >= 2;
  const [copied, setCopied] = useState(false);

  function patch(change: Partial<RoomSettings>) {
    if (!isHost) return;
    onSettings({ ...settings, ...change });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="lobby">
      <div className="lobby-side">
        <Roster
          view={view}
          selfId={selfId}
          speaking={voice.speaking}
          onKick={isHost ? onKick : undefined}
        />

        <Chat
          title="Room chat"
          entries={chat}
          disabled={false}
          placeholder="Message the room"
          onSend={onChat}
          nameOf={(id) => view.players.find((p) => p.id === id)?.name ?? 'Someone'}
          typing={typing}
          onTyping={onTyping}
        />
      </div>

      <div className="lobby-main">
        <div className="lobby-head panel">
          <div>
            <span className="eyebrow">Room code</span>
            <div className="room-code">{view.id}</div>
          </div>

          <button
            className={`invite${copied ? ' is-copied' : ''}`}
            onClick={() => void copyInvite()}
          >
            <Icon name={copied ? 'check' : 'link'} size={16} />
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>

          <VoiceControls voice={voice} />

          <button className="btn btn-primary" onClick={onStart} disabled={!canStart}>
            {isHost
              ? connected >= 2
                ? 'Start game'
                : 'Waiting for one more'
              : 'Waiting for the host'}
          </button>
        </div>

        <div className="settings panel">
          <div>
            <span className="eyebrow">Game settings</span>
            {!isHost && (
              <p className="setting-hint" style={{ marginTop: 6 }}>
                Only the host can change these.
              </p>
            )}
          </div>

          <div className="setting">
            <label htmlFor="mode">Word mode</label>
            <div className="mode-row" id="mode">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  className={`mode${settings.mode === mode.value ? ' is-active' : ''}`}
                  onClick={() => patch({ mode: mode.value })}
                  disabled={!isHost}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <span className="setting-hint">
              {MODES.find((m) => m.value === settings.mode)?.hint}
            </span>
          </div>

          <div className="setting-grid">
            <Range
              id="rounds"
              label="Rounds"
              value={settings.rounds}
              min={2}
              max={10}
              disabled={!isHost}
              onChange={(rounds) => patch({ rounds })}
            />

            <div className="setting">
              <label htmlFor="drawTime">Draw time — {settings.drawTimeSec}s</label>
              <input
                id="drawTime"
                type="range"
                min={0}
                max={DRAW_TIME_STEPS.length - 1}
                value={DRAW_TIME_STEPS.indexOf(
                  settings.drawTimeSec as (typeof DRAW_TIME_STEPS)[number],
                )}
                disabled={!isHost}
                onChange={(event) =>
                  patch({ drawTimeSec: DRAW_TIME_STEPS[Number(event.target.value)] ?? 80 })
                }
              />
            </div>

            <Range
              id="players"
              label="Max players"
              value={settings.maxPlayers}
              min={2}
              max={20}
              disabled={!isHost}
              onChange={(maxPlayers) => patch({ maxPlayers })}
            />

            <Range
              id="choices"
              label="Word choices"
              value={settings.wordChoices}
              min={1}
              max={5}
              disabled={!isHost}
              onChange={(wordChoices) => patch({ wordChoices })}
            />

            <Range
              id="hints"
              label="Hints"
              value={settings.hints}
              min={0}
              max={5}
              disabled={!isHost || settings.mode === 'hidden'}
              onChange={(hints) => patch({ hints })}
            />
          </div>

          <div className="setting">
            <label htmlFor="customWords">Custom words</label>
            <textarea
              id="customWords"
              className="field"
              rows={3}
              disabled={!isHost}
              value={settings.customWords.join(', ')}
              placeholder="lava lamp, tide pool, wind chime"
              onChange={(event) =>
                patch({
                  customWords: event.target.value
                    .split(',')
                    .map((word) => word.trim())
                    .filter((word) => word.length > 0)
                    .slice(0, 500),
                })
              }
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={settings.customWordsOnly}
                disabled={!isHost || settings.customWords.length < 5}
                onChange={(event) => patch({ customWordsOnly: event.target.checked })}
              />
              Use only these words
            </label>
            <span className="setting-hint">
              {settings.customWords.length < 5
                ? `Add ${5 - settings.customWords.length} more to use custom words on their own.`
                : `${settings.customWords.length} custom words ready.`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Range(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="setting">
      <label htmlFor={props.id}>
        {props.label} — {props.value}
      </label>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}
