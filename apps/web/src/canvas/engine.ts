import {
  BRUSH_SIZES,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  PALETTE,
  decodeFrame,
  type DrawFrame,
} from './protocol.js';

const PAPER = '#F7F5F0';

/**
 * Renders the shared drawing.
 *
 * Committed frames live on an offscreen buffer so an incoming frame costs one
 * draw call rather than a full replay. Only undo, clear, and joining mid-turn
 * force a repaint from the frame log.
 */
export class CanvasEngine {
  #buffer: HTMLCanvasElement;
  #bufferCtx: CanvasRenderingContext2D;
  #frames: Uint8Array[] = [];

  constructor() {
    this.#buffer = document.createElement('canvas');
    this.#buffer.width = LOGICAL_WIDTH;
    this.#buffer.height = LOGICAL_HEIGHT;

    const ctx = this.#buffer.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('2D canvas context unavailable');
    this.#bufferCtx = ctx;

    this.clear();
  }

  get frameCount(): number {
    return this.#frames.length;
  }

  get buffer(): HTMLCanvasElement {
    return this.#buffer;
  }

  /** Apply and remember an incoming frame. */
  commit(bytes: Uint8Array): void {
    this.#frames.push(bytes);
    const frame = decodeFrame(bytes);
    if (frame !== null) this.#paint(this.#bufferCtx, frame);
  }

  /** Undo: keep the first `count` frames and repaint from scratch. */
  truncate(count: number): void {
    this.#frames = this.#frames.slice(0, Math.max(0, count));
    this.#repaint();
  }

  clear(): void {
    this.#frames = [];
    this.#bufferCtx.fillStyle = PAPER;
    this.#bufferCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  /** Blit the committed buffer, then the in-progress stroke on top. */
  present(target: CanvasRenderingContext2D, live: DrawFrame | null): void {
    target.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    target.drawImage(this.#buffer, 0, 0);
    if (live !== null) this.#paint(target, live);
  }

  #repaint(): void {
    this.#bufferCtx.fillStyle = PAPER;
    this.#bufferCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    for (const bytes of this.#frames) {
      const frame = decodeFrame(bytes);
      if (frame !== null) this.#paint(this.#bufferCtx, frame);
    }
  }

  #paint(ctx: CanvasRenderingContext2D, frame: DrawFrame): void {
    if (frame.kind === 'fill') {
      floodFill(ctx, frame.x, frame.y, PALETTE[frame.colorIndex] ?? '#000000');
      return;
    }

    const [first] = frame.points;
    if (first === undefined) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = frame.erase ? PAPER : (PALETTE[frame.colorIndex] ?? '#000000');
    ctx.lineWidth = BRUSH_SIZES[frame.sizeIndex] ?? BRUSH_SIZES[1];

    ctx.beginPath();
    if (frame.points.length === 1) {
      // A tap still leaves a dot.
      ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < frame.points.length; i++) {
        const point = frame.points[i]!;
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Scanline flood fill. Tolerant of near-matches so antialiased edges close. */
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, hex: string): void {
  const x0 = Math.round(startX);
  const y0 = Math.round(startY);
  if (x0 < 0 || y0 < 0 || x0 >= LOGICAL_WIDTH || y0 >= LOGICAL_HEIGHT) return;

  const image = ctx.getImageData(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const data = image.data;
  const target = readPixel(data, x0, y0);
  const fill = hexToRgb(hex);
  if (target === null || colorsMatch(target, fill, 0)) return;

  const stack: number[] = [x0, y0];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    let left = x;
    while (left > 0 && matchesAt(data, left - 1, y, target)) left--;

    let right = x;
    while (right < LOGICAL_WIDTH - 1 && matchesAt(data, right + 1, y, target)) right++;

    let spanAbove = false;
    let spanBelow = false;

    for (let i = left; i <= right; i++) {
      writePixel(data, i, y, fill);

      const above = y > 0 && matchesAt(data, i, y - 1, target);
      if (above && !spanAbove) {
        stack.push(i, y - 1);
        spanAbove = true;
      } else if (!above) {
        spanAbove = false;
      }

      const below = y < LOGICAL_HEIGHT - 1 && matchesAt(data, i, y + 1, target);
      if (below && !spanBelow) {
        stack.push(i, y + 1);
        spanBelow = true;
      } else if (!below) {
        spanBelow = false;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

type Rgb = [number, number, number];

const FILL_TOLERANCE = 32;

function readPixel(data: Uint8ClampedArray, x: number, y: number): Rgb | null {
  const i = (y * LOGICAL_WIDTH + x) * 4;
  if (i < 0 || i + 2 >= data.length) return null;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

function writePixel(data: Uint8ClampedArray, x: number, y: number, rgb: Rgb): void {
  const i = (y * LOGICAL_WIDTH + x) * 4;
  data[i] = rgb[0];
  data[i + 1] = rgb[1];
  data[i + 2] = rgb[2];
  data[i + 3] = 255;
}

function matchesAt(data: Uint8ClampedArray, x: number, y: number, target: Rgb): boolean {
  const pixel = readPixel(data, x, y);
  return pixel !== null && colorsMatch(pixel, target, FILL_TOLERANCE);
}

function colorsMatch(a: Rgb, b: Rgb, tolerance: number): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
