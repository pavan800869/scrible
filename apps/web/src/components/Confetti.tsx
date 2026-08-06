import { useEffect, useRef } from 'react';

interface ConfettiProps {
  /** Bump this number to fire a burst. */
  trigger: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  color: string;
}

const COLORS = ['#FFB86B', '#7BD88F', '#7FD1E8', '#FF6B9D', '#FFD166', '#A78BFA'];
const GRAVITY = 0.42;
const DRAG = 0.99;

/**
 * A short burst of paper scraps when someone lands a guess.
 *
 * Canvas rather than DOM nodes: a hundred absolutely-positioned divs animating
 * at once is exactly the kind of thing that makes a game feel cheap on a laptop.
 * Skipped entirely under prefers-reduced-motion.
 */
export function Confetti({ trigger }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitsRef = useRef<Bit[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (trigger === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Two fountains from the lower corners, arcing inward.
    for (const side of [0, 1]) {
      const originX = side === 0 ? canvas.width * 0.1 : canvas.width * 0.9;
      for (let i = 0; i < 55; i++) {
        bitsRef.current.push({
          x: originX,
          y: canvas.height * 0.95,
          vx: (side === 0 ? 1 : -1) * (2 + Math.random() * 7),
          vy: -(11 + Math.random() * 9),
          spin: (Math.random() - 0.5) * 0.35,
          angle: Math.random() * Math.PI,
          size: 5 + Math.random() * 7,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        });
      }
    }

    cancelAnimationFrame(rafRef.current);

    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      bitsRef.current = bitsRef.current.filter((bit) => bit.y < canvas.height + 40);

      for (const bit of bitsRef.current) {
        bit.vy += GRAVITY;
        bit.vx *= DRAG;
        bit.x += bit.vx;
        bit.y += bit.vy;
        bit.angle += bit.spin;

        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.angle);
        ctx.fillStyle = bit.color;
        // Squashed on the spin axis so scraps read as paper, not dots.
        ctx.fillRect(-bit.size / 2, -bit.size / 4, bit.size, bit.size / 2);
        ctx.restore();
      }

      if (bitsRef.current.length > 0) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger]);

  return <canvas className="confetti" ref={canvasRef} aria-hidden="true" />;
}
