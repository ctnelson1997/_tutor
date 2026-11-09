import { describe, it, expect } from 'vitest';
import { stepLabelTitle } from '../stepLabel';

describe("a step label's tooltip", () => {
  it("says what the engine's labels mean: a JS callback (#45), Java's calls too deep to show (#73)", () => {
    expect(stepLabelTitle('js')).toBe('This step starts a callback the event loop ran');
    expect(stepLabelTitle('java')).toBe('Calls this deep run without steps, so the steps fit what can be shown');
  });
});
