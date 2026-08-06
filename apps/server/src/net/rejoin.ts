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
