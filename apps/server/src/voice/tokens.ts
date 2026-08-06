import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export interface VoiceService {
  readonly configured: boolean;
  readonly url: string;
  mint(input: { roomId: string; playerId: string; name: string }): Promise<string>;
  revoke(input: { roomId: string; playerId: string }): Promise<void>;
}

/** Two hours comfortably outlives a game; the client refreshes if it does not. */
const TOKEN_TTL = '2h';

/**
 * LiveKit access tokens.
 *
 * The API secret never leaves the server — it signs tokens here and is used for
 * moderation calls. `identity` is always the server-issued player id, so a
 * client cannot join the audio room as somebody else.
 *
 * With no credentials configured the service reports itself unconfigured and
 * the game runs text-only rather than failing.
 */
export function createVoiceService(env: NodeJS.ProcessEnv = process.env): VoiceService {
  const url = env['LIVEKIT_URL'] ?? '';
  const key = env['LIVEKIT_API_KEY'] ?? '';
  const secret = env['LIVEKIT_API_SECRET'] ?? '';
  const configured = url !== '' && key !== '' && secret !== '';

  let admin: RoomServiceClient | null = null;
  const adminClient = (): RoomServiceClient => {
    admin ??= new RoomServiceClient(url.replace(/^ws/, 'http'), key, secret);
    return admin;
  };

  return {
    configured,
    url,

    async mint({ roomId, playerId, name }) {
      if (!configured) throw new Error('voice is not configured');

      const token = new AccessToken(key, secret, {
        identity: playerId,
        name,
        ttl: TOKEN_TTL,
      });

      token.addGrant({
        room: `scrible-${roomId}`,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        // Voice is for talking, not for moving game state around.
        canPublishData: false,
      });

      return token.toJwt();
    },

    async revoke({ roomId, playerId }) {
      if (!configured) return;
      try {
        await adminClient().removeParticipant(`scrible-${roomId}`, playerId);
      } catch {
        // The participant may never have joined audio. Not an error worth raising.
      }
    },
  };
}
