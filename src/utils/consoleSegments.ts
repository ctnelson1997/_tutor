import type { ConsoleLine } from '../types/snapshot';

/** A piece of a console line: the program's output, or input it read (echoed, #32). */
export interface ConsoleSegment {
  text: string;
  input: boolean;
}

/** A console line split at its input ranges, in order, without empty pieces. */
export function consoleSegments(line: ConsoleLine): ConsoleSegment[] {
  const out: ConsoleSegment[] = [];
  const push = (text: string, input: boolean) => { if (text) out.push({ text, input }); };
  let pos = 0;
  for (const [start, end] of line.input ?? []) {
    push(line.text.slice(pos, start), false);
    push(line.text.slice(start, end), true);
    pos = end;
  }
  push(line.text.slice(pos), false);
  return out;
}
