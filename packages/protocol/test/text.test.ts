import { describe, expect, it } from 'vitest';
import { levenshteinAtMost, normalize } from '../src/text.js';

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Apple ')).toBe('apple');
  });

  it('collapses internal whitespace', () => {
    expect(normalize('ice   cream')).toBe('ice cream');
  });

  it('strips diacritics', () => {
    expect(normalize('café')).toBe('cafe');
  });

  it('removes punctuation but keeps spaces', () => {
    expect(normalize("jack-o'-lantern")).toBe('jackolantern');
  });
});

describe('levenshteinAtMost', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinAtMost('apple', 'apple', 2)).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshteinAtMost('apple', 'apply', 2)).toBe(1);
  });

  it('counts a single deletion', () => {
    expect(levenshteinAtMost('aple', 'apple', 2)).toBe(1);
  });

  it('returns null when the distance exceeds max', () => {
    expect(levenshteinAtMost('apple', 'orange', 2)).toBeNull();
  });

  it('short-circuits on a large length difference', () => {
    expect(levenshteinAtMost('a', 'abcdefghij', 2)).toBeNull();
  });
});
