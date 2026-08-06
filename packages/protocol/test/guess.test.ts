import { describe, expect, it } from 'vitest';
import { classifyGuess } from '../src/guess.js';

describe('classifyGuess', () => {
  it('accepts an exact match', () => {
    expect(classifyGuess('apple', 'apple')).toBe('correct');
  });

  it('accepts a match differing only in case and spacing', () => {
    expect(classifyGuess('  Ice  Cream ', 'ice cream')).toBe('correct');
  });

  it('flags a one-letter typo as close', () => {
    expect(classifyGuess('aple', 'apple')).toBe('close');
  });

  it('flags a two-letter typo as close', () => {
    expect(classifyGuess('aplle', 'apple')).toBe('close');
  });

  it('rejects an unrelated word', () => {
    expect(classifyGuess('orange', 'apple')).toBe('wrong');
  });

  it('does not call a short word close on a large relative error', () => {
    expect(classifyGuess('go', 'cat')).toBe('wrong');
  });

  it('rejects an empty guess', () => {
    expect(classifyGuess('   ', 'apple')).toBe('wrong');
  });
});
