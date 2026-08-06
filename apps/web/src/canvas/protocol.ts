/**
 * Binary drawing frames.
 *
 * The server relays these opaquely — it only checks the magic byte — so the
 * whole format lives here on the client side of the wire.
 *
 * Layout (little-endian):
 *   [0]      magic 0x01
 *   [1]      kind: 0 = stroke, 1 = fill
 *   [2]      colour index into PALETTE
 *   [3]      size index into BRUSH_SIZES
 *   [4]      flags, bit 0 = erase
 *   [5]      reserved
 *   [6..]    int16 x, int16 y pairs
 *
 * Coordinates are in the fixed 1000x600 logical space, so every participant
 * sees identical geometry regardless of their viewport.
 */

export const LOGICAL_WIDTH = 1000;
export const LOGICAL_HEIGHT = 600;

export const STROKE_MAGIC = 0x01;
const HEADER_BYTES = 6;

export const PALETTE = [
  '#1B1D21', '#5B616E', '#9AA1AE', '#F7F5F0',
  '#C4382E', '#E2603B', '#F0913C', '#F5C042',
  '#5E9C4C', '#2F7A55', '#3E9E9E', '#3F7CC4',
  '#2B4C9B', '#6B4FA8', '#A24FA0', '#D95E9A',
  '#7A4A2B', '#A9743F', '#D9A66C', '#EFD3A8',
  '#8C1F1F', '#264D2E', '#12303F', '#000000',
] as const;

export const BRUSH_SIZES = [3, 8, 18, 38] as const;

export type FrameKind = 'stroke' | 'fill';

export interface StrokeFrame {
  kind: 'stroke';
  colorIndex: number;
  sizeIndex: number;
  erase: boolean;
  points: { x: number; y: number }[];
}

export interface FillFrame {
  kind: 'fill';
  colorIndex: number;
  x: number;
  y: number;
}

export type DrawFrame = StrokeFrame | FillFrame;

export function encodeStroke(input: {
  colorIndex: number;
  sizeIndex: number;
  erase: boolean;
  points: readonly { x: number; y: number }[];
}): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + input.points.length * 4);
  const view = new DataView(bytes.buffer);

  bytes[0] = STROKE_MAGIC;
  bytes[1] = 0;
  bytes[2] = input.colorIndex;
  bytes[3] = input.sizeIndex;
  bytes[4] = input.erase ? 1 : 0;

  input.points.forEach((point, i) => {
    view.setInt16(HEADER_BYTES + i * 4, Math.round(point.x), true);
    view.setInt16(HEADER_BYTES + i * 4 + 2, Math.round(point.y), true);
  });

  return bytes;
}

export function encodeFill(input: { colorIndex: number; x: number; y: number }): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + 4);
  const view = new DataView(bytes.buffer);

  bytes[0] = STROKE_MAGIC;
  bytes[1] = 1;
  bytes[2] = input.colorIndex;

  view.setInt16(HEADER_BYTES, Math.round(input.x), true);
  view.setInt16(HEADER_BYTES + 2, Math.round(input.y), true);

  return bytes;
}

/** Returns null for anything malformed. A bad frame must never throw. */
export function decodeFrame(bytes: Uint8Array): DrawFrame | null {
  if (bytes.length < HEADER_BYTES || bytes[0] !== STROKE_MAGIC) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colorIndex = bytes[2] ?? 0;

  if (bytes[1] === 1) {
    if (bytes.length < HEADER_BYTES + 4) return null;
    return {
      kind: 'fill',
      colorIndex,
      x: view.getInt16(HEADER_BYTES, true),
      y: view.getInt16(HEADER_BYTES + 2, true),
    };
  }

  const count = Math.floor((bytes.length - HEADER_BYTES) / 4);
  if (count === 0) return null;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: view.getInt16(HEADER_BYTES + i * 4, true),
      y: view.getInt16(HEADER_BYTES + i * 4 + 2, true),
    });
  }

  return {
    kind: 'stroke',
    colorIndex,
    sizeIndex: bytes[3] ?? 0,
    erase: (bytes[4] ?? 0) === 1,
    points,
  };
}
