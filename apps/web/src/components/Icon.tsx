/**
 * The whole icon vocabulary, drawn rather than typed.
 *
 * Emoji and stray Unicode glyphs render differently on every platform and drag
 * their own colour into a palette that is deliberately narrow, so every mark in
 * the interface is a stroked path on a 24-unit grid that inherits currentColor.
 */

import type { ReactElement } from 'react';

export type IconName =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'undo'
  | 'clear'
  | 'mic'
  | 'mic-off'
  | 'crown'
  | 'check'
  | 'shuffle'
  | 'link'
  | 'like'
  | 'dislike'
  | 'close';

interface IconProps {
  name: IconName;
  size?: number;
  /** Set when the icon carries meaning no adjacent text already provides. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 18, label, className }: IconProps) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label === undefined ? 'presentation' : 'img'}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<IconName, ReactElement> = {
  brush: (
    <>
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L10 17l-4 1 1-4Z" />
      <path d="M15 6l3 3" />
    </>
  ),

  eraser: (
    <>
      <path d="M8.5 20H20" />
      <path d="M14 4.5 4.6 13.9a2 2 0 0 0 0 2.8l3.2 3.2h4l8.6-8.6a2 2 0 0 0 0-2.8l-3.6-3.6a2 2 0 0 0-2.8 0Z" />
      <path d="M9.5 9 15 14.5" />
    </>
  ),

  fill: (
    <>
      <path d="M10 3.5 4.6 9a2 2 0 0 0 0 2.8l5 5a2 2 0 0 0 2.8 0l5.4-5.4Z" />
      <path d="M6.2 7.3 4 5.1" />
      <path d="M20 15c0 1.4-.9 2.5-2 2.5s-2-1.1-2-2.5 2-3.5 2-3.5 2 2.1 2 3.5Z" />
    </>
  ),

  undo: (
    <>
      <path d="M4 8h10a5 5 0 0 1 0 10h-6" />
      <path d="M7.5 4.5 4 8l3.5 3.5" />
    </>
  ),

  clear: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </>
  ),

  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </>
  ),

  'mic-off': (
    <>
      <path d="M9 5.8A3 3 0 0 1 15 6v4" />
      <path d="M15 13.4A3 3 0 0 1 9 12V9.4" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 9.9 5.6M18.5 11.5v.4" />
      <path d="M12 18v3" />
      <path d="M4 3.5 20 20" />
    </>
  ),

  crown: (
    <>
      <path d="M4 17.5h16" />
      <path d="M4 17.5 3 7l5 3.5L12 4l4 6.5L21 7l-1 10.5Z" />
    </>
  ),

  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,

  shuffle: (
    <>
      <path d="M20 5.5a8.5 8.5 0 0 0-15 3" />
      <path d="M4 18.5a8.5 8.5 0 0 0 15-3" />
      <path d="M5 3.5v5h5M19 20.5v-5h-5" />
    </>
  ),

  link: (
    <>
      <path d="M10.5 13.5a3.8 3.8 0 0 0 5.6.3l2.6-2.6a3.8 3.8 0 0 0-5.4-5.4l-1.5 1.5" />
      <path d="M13.5 10.5a3.8 3.8 0 0 0-5.6-.3l-2.6 2.6a3.8 3.8 0 0 0 5.4 5.4l1.5-1.5" />
    </>
  ),

  like: (
    <>
      <path d="M7 20V10l4.2-6a2 2 0 0 1 3.4 1.9L13.5 9.5H18a2 2 0 0 1 2 2.3l-1 6a2 2 0 0 1-2 1.7Z" />
      <rect x="3" y="10" width="4" height="10" rx="1" />
    </>
  ),

  dislike: (
    <>
      <path d="M7 4v10l4.2 6a2 2 0 0 0 3.4-1.9l-1.1-3.6H18a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 17 4Z" />
      <rect x="3" y="4" width="4" height="10" rx="1" />
    </>
  ),

  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
};
