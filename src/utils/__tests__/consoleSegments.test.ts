import { describe, expect, it } from 'vitest';
import { consoleSegments } from '../consoleSegments';

describe('consoleSegments', () => {
  it('splits a line at its input ranges', () => {
    expect(consoleSegments({ text: 'Name: Ada', stream: 'stdout', input: [[6, 9]] })).toEqual([
      { text: 'Name: ', input: false },
      { text: 'Ada', input: true },
    ]);
    expect(consoleSegments({ text: 'abXYcdZ', stream: 'stdout', input: [[2, 4], [6, 7]] })).toEqual([
      { text: 'ab', input: false },
      { text: 'XY', input: true },
      { text: 'cd', input: false },
      { text: 'Z', input: true },
    ]);
  });

  it('gives a line without input as one piece of output, and an empty line as none', () => {
    expect(consoleSegments({ text: 'plain', stream: 'stderr' })).toEqual([{ text: 'plain', input: false }]);
    expect(consoleSegments({ text: '', stream: 'stdout' })).toEqual([]);
  });
});
