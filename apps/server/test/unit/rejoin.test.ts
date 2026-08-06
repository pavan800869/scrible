import { describe, expect, it } from 'vitest';
import { mintRejoinToken, verifyRejoinToken } from '../../src/net/rejoin.js';

const SECRET = 'test-secret';

describe('rejoin tokens', () => {
  it('round-trips a room and player id', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    expect(verifyRejoinToken(SECRET, token)).toEqual({ roomId: 'room12', playerId: 'player-a' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    expect(verifyRejoinToken('other-secret', token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mintRejoinToken(SECRET, 'room12', 'player-a');
    const [payload, signature] = token.split('.');
    const forged = `${Buffer.from('room12:attacker').toString('base64url')}.${signature}`;
    expect(payload).toBeDefined();
    expect(verifyRejoinToken(SECRET, forged)).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyRejoinToken(SECRET, 'garbage')).toBeNull();
    expect(verifyRejoinToken(SECRET, '')).toBeNull();
  });
});
