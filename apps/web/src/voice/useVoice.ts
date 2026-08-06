import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';

export type VoiceStatus = 'off' | 'connecting' | 'live' | 'denied' | 'unavailable' | 'error';

export interface VoiceApi {
  status: VoiceStatus;
  muted: boolean;
  speaking: ReadonlySet<string>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
}

/**
 * Group voice over LiveKit.
 *
 * Identity is whatever the server put in the token — never client-supplied —
 * so a participant cannot claim another player's seat in the audio room.
 * Every failure path degrades to text-only rather than blocking the game.
 *
 * The LiveKit SDK is ~600 kB, so it is imported only when someone actually
 * turns voice on. Text-only players never pay for it.
 */
export function useVoice(input: { roomId: string | null; rejoinToken: string | null }): VoiceApi {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(new Set());

  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef(new Map<string, HTMLMediaElement>());

  const leave = useCallback(() => {
    void roomRef.current?.disconnect();
    roomRef.current = null;
    for (const element of audioRef.current.values()) element.remove();
    audioRef.current.clear();
    setSpeaking(new Set());
    setStatus('off');
  }, []);

  const join = useCallback(async () => {
    if (roomRef.current !== null) return;
    if (input.roomId === null || input.rejoinToken === null) return;

    setStatus('connecting');

    let credentials: { url: string; token: string };
    try {
      const response = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId: input.roomId, rejoinToken: input.rejoinToken }),
      });

      if (response.status === 503) {
        setStatus('unavailable');
        return;
      }
      if (!response.ok) {
        setStatus('error');
        return;
      }
      credentials = (await response.json()) as { url: string; token: string };
    } catch {
      setStatus('error');
      return;
    }

    const livekit = await import('livekit-client');

    const room = new livekit.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    room.on(livekit.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== livekit.Track.Kind.Audio) return;
      const element = track.attach();
      document.body.appendChild(element);
      audioRef.current.set(participant.identity, element);
    });

    room.on(livekit.RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
      track.detach().forEach((element) => element.remove());
      audioRef.current.delete(participant.identity);
    });

    room.on(livekit.RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setSpeaking(new Set(speakers.map((speaker) => speaker.identity)));
    });

    room.on(livekit.RoomEvent.Disconnected, () => {
      roomRef.current = null;
      setStatus('off');
    });

    try {
      await room.connect(credentials.url, credentials.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
      setMuted(false);
      setStatus('live');
    } catch (error) {
      void room.disconnect();
      const name = error instanceof Error ? error.name : '';
      setStatus(name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [input.roomId, input.rejoinToken]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (room === null) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  // Push to talk: hold space, but never while typing a guess.
  useEffect(() => {
    if (status !== 'live') return;

    function isTyping(target: EventTarget | null): boolean {
      return target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
      if (!muted) return;
      event.preventDefault();
      void roomRef.current?.localParticipant.setMicrophoneEnabled(true);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space' || isTyping(event.target)) return;
      if (!muted) return;
      void roomRef.current?.localParticipant.setMicrophoneEnabled(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [status, muted]);

  useEffect(() => leave, [leave]);

  return { status, muted, speaking, join, leave, toggleMute };
}
