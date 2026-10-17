import { describe, it, expect } from 'vitest';
import { errorTitle, runEndLabel, errorLines, moreErrorsNote } from '../runError';

describe('run error labels', () => {
  it('title the error banner by how the run ended', () => {
    expect(errorTitle('exception')).toBe('Uncaught exception');
    expect(errorTitle('limit')).toBe('Stopped');
    expect(errorTitle('error')).toBe('Error');
    expect(errorTitle('compile')).toBe('Compile error');
    expect(errorTitle(undefined)).toBe('Error');
  });

  it('label the step bar link to the last step', () => {
    expect(runEndLabel('exception')).toBe('ends with an exception');
    expect(runEndLabel('limit')).toBe('stopped early');
    expect(runEndLabel('error')).toBe('ends with an error');
    expect(runEndLabel('compile')).toBe('does not compile');
  });
});

describe('error lines (#23)', () => {
  it('mark every compile error\'s line once, else the line where the run stopped', () => {
    expect(errorLines({ message: 'm', kind: 'compile', line: 8, lines: [8, 9, 9, 12] })).toEqual([8, 9, 12]);
    expect(errorLines({ message: 'm', kind: 'exception', line: 4 })).toEqual([4]);
    expect(errorLines({ message: 'm' })).toEqual([]);
  });

  it('note how many more errors the console lists', () => {
    expect(moreErrorsNote({ message: 'm', kind: 'compile', line: 8, lines: [8] })).toBe('');
    expect(moreErrorsNote({ message: 'm', kind: 'compile', line: 8, lines: [8, 9] })).toBe('1 more error listed in the console');
    expect(moreErrorsNote({ message: 'm', kind: 'compile', line: 8, lines: [8, 9, 9, 12] })).toBe('3 more errors listed in the console');
    expect(moreErrorsNote({ message: 'm', line: 3 })).toBe('');
  });
});
