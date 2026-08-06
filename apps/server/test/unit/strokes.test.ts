import { describe, expect, it } from 'vitest';
import { StrokeRelay } from '../../src/net/strokes.js';

describe('StrokeRelay', () => {
  it('accumulates frames in order', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.append(new Uint8Array([2]));
    expect(relay.log()).toHaveLength(2);
  });

  it('undo removes the last frame and reports the new count', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.append(new Uint8Array([2]));
    expect(relay.undo()).toBe(1);
    expect(relay.log()).toHaveLength(1);
  });

  it('undo on an empty log is a no-op', () => {
    const relay = new StrokeRelay();
    expect(relay.undo()).toBe(0);
  });

  it('clear empties the log', () => {
    const relay = new StrokeRelay();
    relay.append(new Uint8Array([1]));
    relay.clear();
    expect(relay.log()).toEqual([]);
  });

  it('drops the oldest frames past the cap so memory stays bounded', () => {
    const relay = new StrokeRelay(3);
    for (let i = 0; i < 5; i++) relay.append(new Uint8Array([i]));
    expect(relay.log()).toHaveLength(3);
    expect(relay.log()[0]).toEqual(new Uint8Array([2]));
  });
});
