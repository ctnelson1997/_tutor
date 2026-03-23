import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../security';

describe('analyzeCode', () => {
  // ── Safe code returns no flags ──

  it('returns empty for simple assignment', () => {
    expect(analyzeCode('x = 1')).toEqual([]);
  });

  it('returns empty for print statements', () => {
    expect(analyzeCode('print("hello")')).toEqual([]);
  });

  it('returns empty for safe imports', () => {
    expect(analyzeCode('import math')).toEqual([]);
    expect(analyzeCode('import random')).toEqual([]);
    expect(analyzeCode('from collections import defaultdict')).toEqual([]);
  });

  it('returns empty for loops and functions', () => {
    expect(analyzeCode('for i in range(10):\n    pass')).toEqual([]);
    expect(analyzeCode('def foo():\n    return 1')).toEqual([]);
  });

  it('returns empty for class definitions', () => {
    expect(analyzeCode('class Foo:\n    pass')).toEqual([]);
  });

  // ── Dangerous imports ──

  it('flags import os', () => {
    const flags = analyzeCode('import os');
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe('warning');
    expect(flags[0].message).toContain('os');
  });

  it('flags import sys', () => {
    const flags = analyzeCode('import sys');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('sys');
  });

  it('flags import subprocess', () => {
    const flags = analyzeCode('import subprocess');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('subprocess');
  });

  it('flags import socket', () => {
    const flags = analyzeCode('import socket');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('socket');
  });

  it('flags import shutil', () => {
    const flags = analyzeCode('import shutil');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('shutil');
  });

  // ── Dangerous builtins ──

  it('flags open()', () => {
    const flags = analyzeCode('f = open("file.txt")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('open');
  });

  it('flags eval()', () => {
    const flags = analyzeCode('eval("1+1")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('eval');
  });

  it('flags exec()', () => {
    const flags = analyzeCode('exec("x = 1")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('exec');
  });

  it('flags compile()', () => {
    const flags = analyzeCode('compile("x=1", "<>", "exec")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('compile');
  });

  it('flags __import__()', () => {
    const flags = analyzeCode('__import__("os")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('import');
  });

  it('flags globals()', () => {
    const flags = analyzeCode('g = globals()');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('globals');
  });

  it('flags getattr()', () => {
    const flags = analyzeCode('getattr(obj, "attr")');
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('getattr');
  });

  // ── Multiple flags ──

  it('returns multiple flags for code with multiple issues', () => {
    const flags = analyzeCode('import os\nimport sys\neval("1")');
    expect(flags.length).toBe(3);
  });

  it('all flags have warning level', () => {
    const flags = analyzeCode('import os\neval("x")\nopen("f")');
    for (const flag of flags) {
      expect(flag.level).toBe('warning');
    }
  });

  // ── Edge cases: no false positives ──

  it('does not flag "os" in variable names', () => {
    expect(analyzeCode('os_version = "linux"')).toEqual([]);
  });

  it('does not flag "open" in variable names', () => {
    // "open" followed by non-paren should not match
    expect(analyzeCode('opened = True')).toEqual([]);
  });

  it('does not flag "eval" in variable names', () => {
    expect(analyzeCode('evaluate = 1')).toEqual([]);
  });

  it('does not flag "sys" in string literals used as variables', () => {
    // "system" should not match \bsys\b
    expect(analyzeCode('system = "running"')).toEqual([]);
  });

  // ── Edge cases: catches variations ──

  it('flags import with extra whitespace', () => {
    expect(analyzeCode('import  os').length).toBeGreaterThan(0);
  });

  it('flags open with no space before paren', () => {
    expect(analyzeCode('open("f")').length).toBeGreaterThan(0);
  });

  it('flags eval with space before paren', () => {
    expect(analyzeCode('eval ("x")').length).toBeGreaterThan(0);
  });

  it('flags code embedded in multiline strings', () => {
    // Static analysis can't distinguish code from strings — this is expected
    const code = 'x = "import os"  # has import os in it\nimport os';
    const flags = analyzeCode(code);
    expect(flags.length).toBeGreaterThan(0);
  });
});
