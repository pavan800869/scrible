import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../../src/net/ratelimit.js';

describe('TokenBucket', () => {
  it('allows up to capacity immediately', () => {
    const bucket = new TokenBucket(3, 1);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(0)).toBe(false);
  });

  it('refills over time', () => {
    const bucket = new TokenBucket(1, 2);
    expect(bucket.tryConsume(0)).toBe(true);
    expect(bucket.tryConsume(100)).toBe(false);
    expect(bucket.tryConsume(600)).toBe(true);
  });

  it('never exceeds capacity when refilling', () => {
    const bucket = new TokenBucket(2, 10);
    bucket.tryConsume(0);
    bucket.tryConsume(0);
    expect(bucket.tryConsume(100_000)).toBe(true);
    expect(bucket.tryConsume(100_000)).toBe(true);
    expect(bucket.tryConsume(100_000)).toBe(false);
  });
});
