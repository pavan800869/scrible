import { useEffect, useRef } from 'react';
import type { CanvasEngine } from './engine.js';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  encodeFill,
  encodeStroke,
  type DrawFrame,
} from './protocol.js';
import type { Tool } from '../components/Toolbar.js';

interface DrawingCanvasProps {
  engine: CanvasEngine;
  enabled: boolean;
  tool: Tool;
  colorIndex: number;
  sizeIndex: number;
  onFrame: (frame: Uint8Array) => void;
}

/** Strokes are batched at this cadence, matching the server's rate limit. */
const FLUSH_MS = 50;

export function DrawingCanvas(props: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const livePoints = useRef<{ x: number; y: number }[]>([]);
  const drawing = useRef(false);
  const lastFlush = useRef(0);

  // Props read inside long-lived event handlers; a ref keeps them current
  // without re-binding listeners on every render.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    let raf = 0;
    const render = () => {
      const live: DrawFrame | null =
        livePoints.current.length > 0
          ? {
              kind: 'stroke',
              colorIndex: latest.current.colorIndex,
              sizeIndex: latest.current.sizeIndex,
              erase: latest.current.tool === 'eraser',
              points: livePoints.current,
            }
          : null;

      latest.current.engine.present(ctx, live);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => cancelAnimationFrame(raf);
  }, []);

  function toLogical(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
    };
  }

  /** Emit the buffered points as one frame, keeping the last point for continuity. */
  function flush(): void {
    const points = livePoints.current;
    if (points.length === 0) return;

    const frame = encodeStroke({
      colorIndex: latest.current.colorIndex,
      sizeIndex: latest.current.sizeIndex,
      erase: latest.current.tool === 'eraser',
      points,
    });

    latest.current.engine.commit(frame);
    latest.current.onFrame(frame);

    const last = points[points.length - 1]!;
    livePoints.current = drawing.current ? [last] : [];
    lastFlush.current = performance.now();
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!props.enabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toLogical(event);

    if (props.tool === 'fill') {
      const frame = encodeFill({ colorIndex: props.colorIndex, x: point.x, y: point.y });
      props.engine.commit(frame);
      props.onFrame(frame);
      return;
    }

    drawing.current = true;
    livePoints.current = [point];
    lastFlush.current = performance.now();
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current || !props.enabled) return;

    livePoints.current.push(toLogical(event));

    if (performance.now() - lastFlush.current >= FLUSH_MS) flush();
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    drawing.current = false;
    flush();
    livePoints.current = [];
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <canvas
      ref={canvasRef}
      width={LOGICAL_WIDTH}
      height={LOGICAL_HEIGHT}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: props.enabled ? 'crosshair' : 'default' }}
      aria-label="Drawing canvas"
    />
  );
}
