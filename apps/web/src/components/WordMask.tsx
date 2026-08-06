import type { MaskCell } from '@scrible/protocol';

interface WordMaskProps {
  mask: MaskCell[] | undefined;
  word: string | undefined;
}

/**
 * Letter slots. Blanks are underscored cells; a revealed letter springs in and
 * its rule turns amber, so progress is legible at a glance.
 */
export function WordMask({ mask, word }: WordMaskProps) {
  if (word !== undefined) {
    return (
      <div className="mask-full" aria-label={`The word is ${word}`}>
        {word}
      </div>
    );
  }

  if (mask === undefined) return null;

  const letters = mask.filter((cell) => cell.kind === 'letter').length;

  return (
    <div className="mask" aria-label={`Word with ${letters} letters`}>
      {mask.map((cell, index) =>
        cell.kind === 'space' ? (
          <span className="mask-gap" key={index} />
        ) : (
          <span
            className={`mask-cell${cell.char !== null ? ' is-revealed' : ''}`}
            key={index}
            aria-hidden="true"
          >
            {cell.char ?? ''}
          </span>
        ),
      )}
    </div>
  );
}
