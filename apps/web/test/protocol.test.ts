import { describe, expect, it } from 'vitest';
import {
  PALETTE,
  STROKE_MAGIC,
  decodeFrame,
  encodeFill,
  encodeStroke,
} from '../src/canvas/protocol.js';

describe('stroke frames', () => {
  it('round-trips a stroke', () => {
    const frame = encodeStroke({
      colorIndex: 5,
      sizeIndex: 2,
      erase: false,
      points: [
        { x: 10, y: 20 },
        { x: 300, y: 450 },
      ],
    });

    expect(decodeFrame(frame)).toEqual({
      kind: 'stroke',
      colorIndex: 5,
      sizeIndex: 2,
      erase: false,
      points: [
        { x: 10, y: 20 },
        { x: 300, y: 450 },
      ],
    });
  });

  it('carries the erase flag', () => {
    const frame = encodeStroke({
      colorIndex: 0, sizeIndex: 0, erase: true, points: [{ x: 1, y: 1 }],
    });
    const decoded = decodeFrame(frame);
    expect(decoded?.kind === 'stroke' && decoded.erase).toBe(true);
  });

  it('rounds fractional pointer coordinates', () => {
    const frame = encodeStroke({
      colorIndex: 0, sizeIndex: 0, erase: false, points: [{ x: 10.7, y: 20.2 }],
    });
    const decoded = decodeFrame(frame);
    expect(decoded?.kind === 'stroke' && decoded.points[0]).toEqual({ x: 11, y: 20 });
  });

  it('starts every frame with the magic byte the server checks', () => {
    const stroke = encodeStroke({
      colorIndex: 0, sizeIndex: 0, erase: false, points: [{ x: 0, y: 0 }],
    });
    expect(stroke[0]).toBe(STROKE_MAGIC);
    expect(encodeFill({ colorIndex: 1, x: 2, y: 3 })[0]).toBe(STROKE_MAGIC);
  });

  it('round-trips a fill', () => {
    expect(decodeFrame(encodeFill({ colorIndex: 7, x: 120, y: 240 }))).toEqual({
      kind: 'fill',
      colorIndex: 7,
      x: 120,
      y: 240,
    });
  });

  it('rejects a frame without the magic byte', () => {
    expect(decodeFrame(new Uint8Array([0x02, 0, 0, 0, 0, 0, 1, 0, 1, 0]))).toBeNull();
  });

  it('rejects a truncated frame', () => {
    expect(decodeFrame(new Uint8Array([STROKE_MAGIC, 0]))).toBeNull();
  });

  it('rejects a stroke with no points', () => {
    expect(decodeFrame(new Uint8Array([STROKE_MAGIC, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('palette', () => {
  it('fits in one byte so the colour index never overflows', () => {
    expect(PALETTE.length).toBeLessThanOrEqual(256);
  });

  it('is all valid hex', () => {
    for (const color of PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
