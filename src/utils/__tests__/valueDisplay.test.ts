import { describe, it, expect } from 'vitest';
import { primitiveText } from '../valueDisplay';

describe('primitiveText', () => {
  it("uses the engine's own rendering when there is one", () => {
    expect(primitiveText({ type: 'string', value: 'B', display: "'B'" })).toBe("'B'");
    expect(primitiveText({ type: 'number', value: 5, display: '5.0' })).toBe('5.0');
    expect(primitiveText({ type: 'string', value: 'a\nb', display: '"a\nb"' })).toBe('"a\nb"');
  });

  it('otherwise renders by type, as the JS and Python engines expect', () => {
    expect(primitiveText({ type: 'string', value: 'hi' })).toBe('"hi"');
    expect(primitiveText({ type: 'number', value: 5 })).toBe('5');
    expect(primitiveText({ type: 'boolean', value: true })).toBe('true');
    expect(primitiveText({ type: 'null', value: null })).toBe('null');
    expect(primitiveText({ type: 'undefined', value: null })).toBe('undefined');
    expect(primitiveText({ type: 'bigint', value: '9007199254740993' })).toBe('9007199254740993');
  });
});
