import type { PrimitiveValue } from '../types/snapshot';

/**
 * The text a primitive value is shown as: the engine's own rendering when it
 * gave one (`display`, such as Java's `'B'` or `5.0`), else a rendering by
 * type, with strings in double quotes.
 */
export function primitiveText(value: PrimitiveValue): string {
  if (value.display !== undefined) return value.display;
  switch (value.type) {
    case 'string': return `"${value.value}"`;
    case 'null': return 'null';
    case 'undefined': return 'undefined';
    case 'empty': return 'empty';
    default: return String(value.value);
  }
}
