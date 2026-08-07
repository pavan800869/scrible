import { describe, expect, it } from 'vitest';
import { clientMessageSchema } from '../src/messages.js';

describe('clientMessageSchema', () => {
  it('accepts a join', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: 'Ada', avatarSeed: 'seed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: '', avatarSeed: 'seed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an over-long name', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join', roomId: 'abc123', name: 'x'.repeat(25), avatarSeed: 'seed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(clientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('rejects a chat message that is too long', () => {
    const result = clientMessageSchema.safeParse({ type: 'chat', text: 'x'.repeat(300) });
    expect(result.success).toBe(false);
  });

  it('accepts a word choice', () => {
    expect(clientMessageSchema.safeParse({ type: 'choose-word', index: 1 }).success).toBe(true);
  });

  it('rejects a negative word choice index', () => {
    expect(clientMessageSchema.safeParse({ type: 'choose-word', index: -1 }).success).toBe(false);
  });

  it('accepts a typing flag', () => {
    expect(clientMessageSchema.safeParse({ type: 'typing', on: true }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'typing', on: false }).success).toBe(true);
  });

  it('rejects a typing message carrying text, so a draft can never leak', () => {
    const result = clientMessageSchema.safeParse({ type: 'typing', on: true, text: 'apple' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data)).toEqual(['type', 'on']);
    }
  });

  it('rejects a typing message without the flag', () => {
    expect(clientMessageSchema.safeParse({ type: 'typing' }).success).toBe(false);
  });

  it('accepts both reaction kinds', () => {
    expect(clientMessageSchema.safeParse({ type: 'react', kind: 'like' }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'react', kind: 'dislike' }).success).toBe(true);
  });

  it('accepts a null reaction, which withdraws a vote', () => {
    expect(clientMessageSchema.safeParse({ type: 'react', kind: null }).success).toBe(true);
  });

  it('rejects an invented reaction kind', () => {
    expect(clientMessageSchema.safeParse({ type: 'react', kind: 'love' }).success).toBe(false);
  });

  it('rejects a reaction with no kind at all', () => {
    expect(clientMessageSchema.safeParse({ type: 'react' }).success).toBe(false);
  });
});
