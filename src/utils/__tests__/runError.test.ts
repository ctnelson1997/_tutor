import { describe, it, expect } from 'vitest';
import { errorTitle, runEndLabel } from '../runError';

describe('run error labels', () => {
  it('title the error banner by how the run ended', () => {
    expect(errorTitle('exception')).toBe('Uncaught exception');
    expect(errorTitle('limit')).toBe('Stopped');
    expect(errorTitle('error')).toBe('Error');
    expect(errorTitle(undefined)).toBe('Error');
  });

  it('label the step bar link to the last step', () => {
    expect(runEndLabel('exception')).toBe('ends with an exception');
    expect(runEndLabel('limit')).toBe('stopped early');
    expect(runEndLabel('error')).toBe('ends with an error');
  });
});
