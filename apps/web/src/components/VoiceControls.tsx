import type { VoiceApi } from '../voice/useVoice.js';

const MESSAGE: Record<VoiceApi['status'], string> = {
  off: 'Voice off',
  connecting: 'Connecting…',
  live: 'Voice on',
  denied: 'Microphone blocked',
  unavailable: 'Voice not configured',
  error: "Voice didn't connect",
};

export function VoiceControls({ voice }: { voice: VoiceApi }) {
  if (voice.status === 'unavailable') {
    return <span className="voice-state">Text only</span>;
  }

  if (voice.status === 'off' || voice.status === 'error' || voice.status === 'denied') {
    return (
      <div className="voice">
        {voice.status !== 'off' && <span className="voice-state">{MESSAGE[voice.status]}</span>}
        <button className="btn" onClick={() => void voice.join()}>
          {voice.status === 'off' ? 'Join voice' : 'Try again'}
        </button>
      </div>
    );
  }

  if (voice.status === 'connecting') {
    return <span className="voice-state">Connecting…</span>;
  }

  return (
    <div className="voice">
      <button
        className={`mic${voice.muted ? ' is-off' : ' is-live'}`}
        onClick={voice.toggleMute}
        aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
        title={voice.muted ? 'Muted — hold Space to talk' : 'Live — click to mute'}
      >
        {voice.muted ? '🔇' : '🎙'}
      </button>
      <button className="btn-ghost" style={{ fontSize: 12 }} onClick={voice.leave}>
        Leave
      </button>
    </div>
  );
}
