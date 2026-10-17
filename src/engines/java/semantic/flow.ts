/**
 * Flow analysis (#23): javac's checks that depend on the shape of the code
 * rather than on types, run over the bound tree before the program runs.
 *
 * - Reachability (JLS §14.22): a statement after `return`, `break`,
 *   `continue`, `throw` or a loop that never ends is "unreachable statement";
 *   a non-void method (or lambda) whose body can end normally is "missing
 *   return statement". An if statement's branches are reachable whatever
 *   its condition, so `if (DEBUG) …` is fine.
 * - Definite assignment (JLS ch. 16): reading a local that isn't assigned on
 *   every path to it is "variable x might not have been initialized"; `&&`,
 *   `||`, `!` and `?:` are followed through their true and false outcomes,
 *   and constant conditions count.
 * - Final variables: a final local, parameter or field assigned when it
 *   can't be ("cannot assign a value to final variable x", "might already
 *   have been assigned", "might be assigned in loop"), a blank final field a
 *   constructor leaves unassigned, and a blank static final the static
 *   initializers leave unassigned.
 * - Checked exceptions (JLS §11.2): a checked exception thrown (by `throw`
 *   or a call whose method declares it) must be caught or declared, and a
 *   catch clause for a checked exception the try block can't throw is an
 *   error.
 * - `break` and `continue` outside a loop or switch.
 */

import type * as A from '../ast/ast';
import type * as B from './bound';
import type { ClassSymbol, FieldSymbol, LocalSymbol, MethodSymbol } from './symbols';
import { type JType, typeName } from './types';
import type { Diagnostic } from './binder';

/** What is definitely assigned here (locals, and blank final fields in a constructor); 'dead' where code can't run. */
type Assigned = Set<LocalSymbol | FieldSymbol> | 'dead';

interface State {
  da: Assigned;
  /** Possibly assigned: for final variables assigned twice. */
  pa: Set<LocalSymbol | FieldSymbol>;
}

interface Jump {
  label?: string;
  /** A loop takes break and continue; a switch break; a labeled statement break with its label. */
  kind: 'loop' | 'switch' | 'labeled';
  breaks: State[];
  continues: State[];
}

/** A try statement's catches while its block is analyzed, and the checked exceptions the block throws. */
interface Handler {
  catches: ClassSymbol[];
  thrown: ClassSymbol[];
}

interface Lib {
  throwable: ClassSymbol;
  runtimeException: ClassSymbol;
  error: ClassSymbol;
  exception: ClassSymbol;
}

const dead = (): State => ({ da: 'dead', pa: new Set() });

function copy(s: State): State {
  return { da: s.da === 'dead' ? 'dead' : new Set(s.da), pa: new Set(s.pa) };
}

function join(...states: State[]): State {
  let da: Assigned = 'dead';
  const pa = new Set<LocalSymbol | FieldSymbol>();
  for (const s of states) {
    for (const x of s.pa) pa.add(x);
    if (s.da === 'dead') continue;
    if (da === 'dead') da = new Set(s.da);
    else for (const x of da) if (!s.da.has(x)) da.delete(x);
  }
  return { da, pa };
}

function isSubclass(sym: ClassSymbol, target: ClassSymbol): boolean {
  if (sym === target) return true;
  return [sym.superclass?.symbol, ...sym.interfaces.map(i => i.symbol)].some(s => s !== undefined && isSubclass(s, target));
}

/** Run the flow checks over a bound program. */
export function checkFlow(program: B.BProgram, lib: Lib, source = ''): Diagnostic[] {
  return new Flow(lib, source).program(program);
}

class Flow {
  private readonly lib: Lib;
  private readonly diagnostics: Diagnostic[] = [];
  private jumps: Jump[] = [];
  private handlers: Handler[] = [];
  /** What the code being analyzed may throw without catching it: the method's throws clause (or a lambda's function type's). */
  private declared: JType[] = [];
  /** Is an uncaught checked exception reported here (false in an instance initializer, whose exceptions the constructors declare). */
  private reportUncaught = true;
  /** The loop nesting where each blank final local was declared ("might be assigned in loop"). */
  private readonly loopDepthOf = new Map<LocalSymbol, number>();
  private loopDepth = 0;
  /** The locals without an initializer declared in the code being analyzed: the only ones a read checks (a local class's method sees its captured locals assigned). */
  private ownLocals = new Set<LocalSymbol>();
  /** The class whose constructor or initializer is analyzed (its blank final fields may be assigned), and whether static. */
  private initializing?: { cls: ClassSymbol; isStatic: boolean };
  /** The checked exceptions a catch parameter can rethrow (JLS §11.2.2: what its try block throws). */
  private readonly rethrows = new Map<LocalSymbol, ClassSymbol[]>();
  private readonly reported = new Set<string>();

  private readonly source: string;

  constructor(lib: Lib, source: string) {
    this.lib = lib;
    this.source = source;
  }

  private error(message: string, range: A.Range): void {
    const key = `${range.start}:${message}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.diagnostics.push({ kind: 'error', message, range });
  }

  program(p: B.BProgram): Diagnostic[] {
    for (const c of p.classes) this.cls(c);
    return this.diagnostics;
  }

  private cls(c: B.BClass): void {
    const sym = c.symbol;
    const blankFinals = (isStatic: boolean) => [...sym.fields.values()].filter(f => f.isFinal && f.isStatic === isStatic && f.constant === undefined
      && f.enumOrdinal === undefined && !f.recordComponent && f.name !== 'this$0' && !f.name.startsWith('val$') && !sym.isInterface
      && !c[isStatic ? 'staticInit' : 'instanceInit'].some(i => i.kind === 'field' && i.field === f));
    // Static initialization: static field initializers and static blocks; their checked exceptions can't be declared.
    this.initializing = { cls: sym, isStatic: true };
    let s: State = { da: new Set(), pa: new Set() };
    this.declared = [];
    for (const item of c.staticInit) s = this.initializer(item, s);
    this.initializing = undefined;
    // A blank static final the static initializers leave unassigned.
    for (const f of blankFinals(true)) {
      if (s.da !== 'dead' && !s.da.has(f)) this.error(`variable ${f.name} might not have been initialized`, f.decl?.range ?? sym.decl!.range);
    }
    // Instance initializers run at the start of every constructor that calls super(): their exceptions go to the constructors.
    let afterInit: State = { da: new Set(), pa: new Set() };
    this.initializing = { cls: sym, isStatic: false };
    this.reportUncaught = false;
    for (const item of c.instanceInit) afterInit = this.initializer(item, afterInit);
    this.reportUncaught = true;
    this.initializing = undefined;
    const finals = blankFinals(false);
    for (const m of c.methods) this.method(m, undefined);
    for (const ctor of c.constructors) {
      const delegates = ctor.explicitCall?.target === 'this';
      // The default constructor has no body: what the initializers assign is all it assigns.
      const end = ctor.body ? this.method(ctor, delegates ? undefined : afterInit) : copy(afterInit);
      if (delegates || sym.kind === 'record' || ctor.symbol.synthetic) continue;
      // A blank final field the constructor leaves unassigned.
      for (const f of finals) {
        if (end.da === 'dead' || end.da.has(f)) continue;
        if (!ctor.symbol.decl) this.error(`variable ${f.name} not initialized in the default constructor`, f.decl?.range ?? sym.decl!.range);
        else this.error(`variable ${f.name} might not have been initialized`, endOf(ctor.body!.range));
      }
    }
  }

  private initializer(item: B.BInitializer, s: State): State {
    if (item.kind === 'field') {
      const after = this.expr(item.value, s);
      if (after.da !== 'dead') after.da.add(item.field);
      after.pa.add(item.field);
      return after;
    }
    if (item.kind === 'block') return this.stmt(item.body, s);
    let st = s;
    for (const a of item.args) st = this.expr(a, st);
    if (item.ctor) this.calls(item.ctor, item.range);
    return st;
  }

  /** A method or constructor body; for a constructor calling super(), `afterInit` is the state after the instance initializers. */
  private method(m: B.BMethod, afterInit: State | undefined): State {
    if (!m.body) return dead();
    const sym = m.symbol;
    this.declared = sym.throws;
    this.jumps = [];
    this.handlers = [];
    this.loopDepth = 0;
    const outerLocals = this.ownLocals;
    this.ownLocals = new Set();
    let s: State = { da: new Set(m.params), pa: new Set() };
    if (sym.isConstructor) {
      this.initializing = { cls: sym.owner, isStatic: false };
      if (m.explicitCall) {
        for (const a of m.explicitCall.args) s = this.expr(a, s);
        if (m.explicitCall.ctor) this.calls(m.explicitCall.ctor, m.explicitCall.range);
      }
      // After super(…), the instance initializers have run.
      if (afterInit) s = copyWith(s, afterInit);
    }
    const end = this.stmt(m.body, s);
    if (end.da !== 'dead' && !sym.isConstructor && sym.returnType.tag !== 'void' && !isLoose(sym.returnType)) {
      this.error('missing return statement', endOf(m.body.range));
    }
    this.initializing = undefined;
    this.ownLocals = outerLocals;
    return end;
  }

  // ── Statements ──

  private stmt(st: B.BStmt, s: State): State {
    switch (st.kind) {
      case 'Block': return this.block(st.statements, s);
      case 'LocalDecl': {
        let cur = s;
        for (const d of st.declarators) {
          if (!d.init) this.ownLocals.add(d.local);
          if (d.local.isFinal && !d.init) this.loopDepthOf.set(d.local, this.loopDepth);
          if (d.init) {
            cur = this.expr(d.init, cur);
            if (cur.da !== 'dead') cur.da.add(d.local);
            cur.pa.add(d.local);
          }
        }
        return cur;
      }
      case 'ExprStmt': return this.expr(st.expr, s);
      case 'If': {
        // An if statement's branches can be reached whenever it can, whatever its condition (JLS §14.22), so
        // `if (DEBUG) …` is fine; a constant condition only makes everything assigned in the branch it skips.
        const { t, f } = this.cond(st.cond, s);
        const then = this.stmt(st.then, this.reachable(t, s));
        const otherwise = st.else ? this.stmt(st.else, this.reachable(f, s)) : this.reachable(f, s);
        return join(then, otherwise);
      }
      case 'While': {
        const { t, f } = this.cond(st.cond, s);
        const jump = this.enterLoop();
        if (t.da === 'dead') this.error('unreachable statement', st.body.range);
        this.stmt(st.body, t.da === 'dead' ? copy(s) : t);
        this.leave(jump);
        return join(f, ...jump.breaks);
      }
      case 'DoWhile': {
        const jump = this.enterLoop();
        const bodyEnd = this.stmt(st.body, s);
        this.leave(jump);
        const { f } = this.cond(st.cond, join(bodyEnd, ...jump.continues));
        return join(f, ...jump.breaks);
      }
      case 'For': {
        let cur = s;
        for (const i of st.init) cur = this.stmt(i, cur);
        const { t, f } = st.cond ? this.cond(st.cond, cur) : { t: cur, f: dead() };
        const jump = this.enterLoop();
        if (t.da === 'dead') this.error('unreachable statement', st.body.range);
        const bodyEnd = this.stmt(st.body, t.da === 'dead' ? copy(cur) : t);
        let upd = join(bodyEnd, ...jump.continues);
        for (const u of st.update) upd = this.expr(u, upd);
        this.leave(jump);
        return join(f, ...jump.breaks);
      }
      case 'ForEach': {
        const afterIterable = this.expr(st.iterable, s);
        const body = copy(afterIterable);
        if (body.da !== 'dead') body.da.add(st.local);
        const jump = this.enterLoop();
        this.stmt(st.body, body);
        this.leave(jump);
        return join(afterIterable, ...jump.breaks);
      }
      case 'Labeled': {
        const jump: Jump = { label: st.label, kind: 'labeled', breaks: [], continues: [] };
        // A labeled loop takes the label for break and continue.
        const isLoop = st.body.kind === 'While' || st.body.kind === 'DoWhile' || st.body.kind === 'For' || st.body.kind === 'ForEach';
        this.jumps.push(jump);
        this.pendingLabel = isLoop ? st.label : undefined;
        const end = this.stmt(st.body, s);
        this.jumps.pop();
        return join(end, ...jump.breaks);
      }
      case 'SwitchStmt': return this.switch_(st.switch, s, false).state;
      case 'Break': {
        const target = this.target(st.label, false);
        if (!target) this.error(st.label ? `undefined label: ${st.label}` : 'break outside switch or loop', st.range);
        else target.breaks.push(copy(s));
        return dead();
      }
      case 'Continue': {
        const target = this.target(st.label, true);
        if (!target) this.error(st.label ? `undefined label: ${st.label}` : 'continue outside of loop', st.range);
        else target.continues.push(copy(s));
        return dead();
      }
      case 'Return': {
        if (st.value) this.expr(st.value, s);
        return dead();
      }
      case 'Throw': {
        const after = this.expr(st.value, s);
        this.throws(this.thrownBy(st.value), st.range);
        return { da: 'dead', pa: after.pa };
      }
      case 'Yield': {
        const after = this.expr(st.value, s);
        const target = [...this.jumps].reverse().find(j => j.kind === 'switch');
        target?.breaks.push(copy(after));
        return dead();
      }
      case 'Try': return this.try_(st, s);
      case 'Synchronized': return this.stmt(st.body, this.expr(st.lock, s));
      case 'Assert': return s;
      case 'Empty': case 'Unsupported': return s;
    }
  }

  /** The label for the loop being entered (a labeled loop's). */
  private pendingLabel?: string;

  private enterLoop(): Jump {
    const jump: Jump = { label: this.pendingLabel, kind: 'loop', breaks: [], continues: [] };
    this.pendingLabel = undefined;
    this.jumps.push(jump);
    this.loopDepth++;
    return jump;
  }

  private leave(jump: Jump): void {
    this.jumps.splice(this.jumps.lastIndexOf(jump), 1);
    this.loopDepth--;
  }

  /** What `break [label]` or `continue [label]` jumps to. */
  private target(label: string | undefined, isContinue: boolean): Jump | undefined {
    for (let i = this.jumps.length - 1; i >= 0; i--) {
      const j = this.jumps[i];
      if (label === undefined) {
        if (j.kind === 'loop' || (!isContinue && j.kind === 'switch')) return j;
      } else if (j.label === label && (!isContinue || j.kind === 'loop')) {
        return j;
      }
    }
    return undefined;
  }

  /**
   * The state of a branch an if statement's constant condition skips: still
   * reachable if the statement is, with every variable declared so far
   * definitely assigned (vacuously, JLS §16).
   */
  private reachable(branch: State, before: State): State {
    if (branch.da !== 'dead' || before.da === 'dead') return branch;
    return { da: new Set([...before.da, ...this.ownLocals]), pa: new Set(branch.pa) };
  }

  private block(statements: B.BStmt[], s: State): State {
    let cur = s;
    let live = s;
    let reported = false;
    for (const st of statements) {
      if (cur.da === 'dead' && !reported && st.kind !== 'Empty') {
        // The first statement that can't be reached; the rest is analyzed as if it could be.
        this.error('unreachable statement', st.range);
        reported = true;
        cur = copy(live);
      }
      if (cur.da !== 'dead') live = cur;
      cur = this.stmt(st, cur);
    }
    return cur;
  }

  private switch_(sw: B.BSwitch, s: State, isExpression: boolean): { state: State } {
    const after = this.expr(sw.selector, s);
    const jump: Jump = { kind: 'switch', breaks: [], continues: [] };
    this.jumps.push(jump);
    let fall: State = dead();
    const ends: State[] = [];
    const hasDefault = sw.cases.some(c => c.labels.some(l => l.kind === 'default'));
    for (const c of sw.cases) {
      let cur = sw.arrow ? copy(after) : join(fall, copy(after));
      if (c.guard) cur = this.cond(c.guard, cur).t;
      if (c.value) cur = this.expr(c.value, cur);
      else cur = this.block(c.body, cur);
      if (sw.arrow) ends.push(cur);
      else fall = cur;
    }
    this.jumps.pop();
    if (!sw.arrow) ends.push(fall);
    // Without a default (a statement over an enum or int, say), no case may run.
    const exhaustive = hasDefault || isExpression;
    return { state: join(...ends, ...jump.breaks, ...(exhaustive ? [] : [after])) };
  }

  private try_(st: B.BTry, s: State): State {
    // What is assigned before the try statement is all a catch or finally block can count on.
    const before = copy(s);
    let cur = copy(s);
    const handler: Handler = { catches: st.catches.flatMap(c => c.types), thrown: [] };
    this.handlers.push(handler);
    for (const r of st.resources) {
      if ('declarators' in r) {
        cur = this.stmt(r, cur);
        for (const d of r.declarators) this.closes(d.local.type, r.range);
      } else {
        cur = this.expr(r, cur);
        this.closes(r.type, r.range);
      }
    }
    const tryEnd = this.stmt(st.block, cur);
    this.handlers.pop();
    // A catch clause for a checked exception the try block can't throw (JLS §11.2.3), or one caught already.
    const seen: ClassSymbol[] = [];
    for (const c of st.catches) {
      for (const t of c.types) {
        if (seen.some(p => isSubclass(t, p))) this.error(`exception ${t.name} has already been caught`, c.range);
        if (this.isChecked(t) && t !== this.lib.exception && t !== this.lib.throwable && !handler.thrown.some(x => isSubclass(x, t) || isSubclass(t, x))) {
          this.error(`exception ${t.name} is never thrown in body of corresponding try statement`, c.range);
        }
      }
      seen.push(...c.types);
      this.rethrows.set(c.local, handler.thrown.filter(x => c.types.some(t => isSubclass(x, t))));
    }
    const catchEnds = st.catches.map(c => {
      const start = copy(before);
      if (start.da !== 'dead') start.da.add(c.local);
      return this.stmt(c.body, start);
    });
    const end = join(tryEnd, ...catchEnds);
    if (!st.finally) return end;
    const fin = this.stmt(st.finally, copy(before));
    if (fin.da === 'dead') return fin;
    if (end.da === 'dead') return { da: 'dead', pa: new Set([...end.pa, ...fin.pa]) };
    return { da: new Set([...end.da, ...fin.da]), pa: new Set([...end.pa, ...fin.pa]) };
  }

  // ── Expressions ──

  /** A boolean condition's states when it is true and when it is false (JLS §16.1). */
  private cond(e: B.BExpr, s: State): { t: State; f: State } {
    if (e.kind === 'Const' && typeof e.value === 'boolean') {
      return e.value ? { t: s, f: { da: 'dead', pa: new Set(s.pa) } } : { t: { da: 'dead', pa: new Set(s.pa) }, f: s };
    }
    if (e.kind === 'Logical') {
      const l = this.cond(e.left, s);
      if (e.op === '&&') {
        const r = this.cond(e.right, l.t);
        return { t: r.t, f: join(l.f, r.f) };
      }
      const r = this.cond(e.right, l.f);
      return { t: join(l.t, r.t), f: r.f };
    }
    if (e.kind === 'Unary' && e.op === '!') {
      const inner = this.cond(e.operand, s);
      return { t: inner.f, f: inner.t };
    }
    if (e.kind === 'Conditional' && e.type.tag === 'primitive' && e.type.name === 'boolean') {
      const c = this.cond(e.cond, s);
      const a = this.cond(e.then, c.t), b = this.cond(e.else, c.f);
      return { t: join(a.t, b.t), f: join(a.f, b.f) };
    }
    const after = this.expr(e, s);
    return { t: after, f: copy(after) };
  }

  private expr(e: B.BExpr, s: State): State {
    switch (e.kind) {
      case 'Const': case 'This': case 'OuterThis': case 'ClassLiteral': case 'StaticField': case 'Unsupported': return s;
      case 'Local': this.read(e.local, s, e.range); return s;
      case 'Field': return this.readField(e, this.expr(e.target, s));
      case 'ArrayLength': return this.expr(e.array, s);
      case 'ArrayElement': return this.expr(e.index, this.expr(e.array, s));
      case 'Call': {
        let cur = e.target ? this.expr(e.target, s) : s;
        for (const a of e.args) cur = this.expr(a, cur);
        this.calls(e.method, this.argumentsAt(e.range));
        return cur;
      }
      case 'DynamicCall': {
        let cur = e.target ? this.expr(e.target, s) : s;
        for (const a of e.args) cur = this.expr(a, cur);
        return cur;
      }
      case 'New': {
        let cur = e.outer ? this.expr(e.outer, s) : s;
        for (const a of e.args) cur = this.expr(a, cur);
        if (e.ctor) this.calls(e.ctor, e.range);
        // A local or anonymous class reads the locals it captures when it is made.
        for (const local of e.cls.captures.keys()) this.read(local, cur, e.range);
        return cur;
      }
      case 'NewArray': return e.dims.reduce((cur, d) => this.expr(d, cur), s);
      case 'ArrayLiteral': return e.elements.reduce((cur, x) => this.expr(x, cur), s);
      case 'Unary': return this.expr(e.operand, s);
      case 'IncDec': {
        const cur = this.lvalue(e.target, s, true);
        return this.assign(e.target, cur, e.range);
      }
      case 'Binary': case 'RefEquals': case 'Concat': return this.expr(e.right, this.expr(e.left, s));
      case 'Logical': case 'Conditional': {
        if (e.kind === 'Conditional' && !(e.type.tag === 'primitive' && e.type.name === 'boolean')) {
          const c = this.cond(e.cond, s);
          return join(this.expr(e.then, c.t), this.expr(e.else, c.f));
        }
        const { t, f } = this.cond(e, s);
        return join(t, f);
      }
      case 'Assign': {
        const cur = this.expr(e.value, this.lvalue(e.target, s, false));
        return this.assign(e.target, cur, e.range);
      }
      case 'CompoundAssign': {
        const cur = this.expr(e.value, this.lvalue(e.target, s, true));
        return this.assign(e.target, cur, e.range);
      }
      case 'Convert': return this.expr(e.expr, s);
      case 'InstanceOf': {
        const cur = this.expr(e.expr, s);
        if (e.binding && cur.da !== 'dead') cur.da.add(e.binding);
        return cur;
      }
      case 'SwitchExpr': return this.switch_(e.switch, s, true).state;
      case 'Lambda': return this.lambda(e, s);
    }
  }

  /** The parts of an assignment target evaluated before the value (and, for compound assignment and ++, its read). */
  private lvalue(t: B.BLValue, s: State, reads: boolean): State {
    switch (t.kind) {
      case 'Local':
        if (reads) this.read(t.local, s, t.range);
        return s;
      case 'StaticField': return s;
      case 'Field': return reads ? this.readField(t, this.expr(t.target, s)) : this.expr(t.target, s);
      case 'ArrayElement': return this.expr(t.index, this.expr(t.array, s));
    }
  }

  private read(local: LocalSymbol, s: State, range: A.Range): void {
    if (s.da === 'dead' || s.da.has(local) || !this.ownLocals.has(local)) return;
    this.error(`variable ${local.name} might not have been initialized`, range);
    s.da.add(local); // reported once on this path, as javac does
  }

  /** A blank final field read in its class's constructor or initializer before it is assigned (`this.x`, or `x`). */
  private readField(e: B.BField, s: State): State {
    const f = e.field;
    if (this.initializing && !this.initializing.isStatic && f.owner === this.initializing.cls && f.isFinal && e.target.kind === 'This'
      && s.da !== 'dead' && !s.da.has(f) && this.isBlankFinal(f)) {
      this.error(`variable ${f.name} might not have been initialized`, e.range);
      s.da.add(f);
    }
    return s;
  }

  private isBlankFinal(f: FieldSymbol): boolean {
    return f.isFinal && f.constant === undefined && f.enumOrdinal === undefined && !f.recordComponent && f.decl?.init === undefined
      && f.name !== 'this$0' && !f.name.startsWith('val$');
  }

  private assign(t: B.BLValue, s: State, range: A.Range): State {
    if (t.kind === 'Local') {
      const local = t.local;
      if (local.isFinal) {
        if (local.kind === 'param') this.error(`final parameter ${local.name} may not be assigned`, range);
        else if (local.kind !== 'local' || local.hasInit) this.error(`cannot assign a value to final variable ${local.name}`, range);
        else if ((this.loopDepthOf.get(local) ?? 0) < this.loopDepth) this.error(`variable ${local.name} might be assigned in loop`, range);
        else if (s.pa.has(local)) this.error(`variable ${local.name} might already have been assigned`, range);
      }
      if (s.da !== 'dead') s.da.add(local);
      s.pa.add(local);
      return s;
    }
    if (t.kind === 'Field' || t.kind === 'StaticField') return this.assignField(t.field, s, range, t.kind === 'StaticField' || t.target.kind === 'This');
    return s;
  }

  /** An assignment to a field: a final one only in its own class's constructors and initializers, once. */
  private assignField(f: FieldSymbol, s: State, range: A.Range, throughThis: boolean): State {
    if (f.isFinal && f.name !== 'this$0' && !f.name.startsWith('val$')) {
      const allowed = this.initializing && this.initializing.cls === f.owner && this.initializing.isStatic === f.isStatic && throughThis && this.isBlankFinalOrInit(f);
      if (!allowed) this.error(`cannot assign a value to final variable ${f.name}`, range);
      else if (s.pa.has(f)) this.error(`variable ${f.name} might already have been assigned`, range);
      else if (this.loopDepth > 0) this.error(`variable ${f.name} might be assigned in loop`, range);
    }
    if (s.da !== 'dead') s.da.add(f);
    s.pa.add(f);
    return s;
  }

  private isBlankFinalOrInit(f: FieldSymbol): boolean {
    return f.constant === undefined && f.enumOrdinal === undefined;
  }

  /** A lambda: what it captures must be assigned; its body is analyzed on its own, with its function type's exceptions. */
  private lambda(e: B.BLambda, s: State): State {
    const cur = e.receiver ? this.expr(e.receiver.value, s) : s;
    for (const local of e.captures) this.read(local, cur, e.range);
    if (e.methodRef) {
      if (e.body.kind !== 'Block') this.expr(e.body as B.BExpr, { da: 'dead', pa: new Set() });
      return cur;
    }
    const saved = { jumps: this.jumps, handlers: this.handlers, declared: this.declared, loopDepth: this.loopDepth, initializing: this.initializing, reportUncaught: this.reportUncaught };
    this.jumps = [];
    this.handlers = [];
    this.declared = e.sam.throws;
    this.loopDepth = 0;
    this.initializing = undefined;
    this.reportUncaught = true;
    try {
      const da = new Set<LocalSymbol | FieldSymbol>(cur.da === 'dead' ? [] : cur.da);
      for (const p of e.params) da.add(p);
      const start: State = { da, pa: new Set() };
      if (e.body.kind === 'Block') {
        const end = this.stmt(e.body as B.BBlock, start);
        if (end.da !== 'dead' && e.sam.returnType.tag !== 'void' && hasValueReturn(e.body as B.BBlock)) {
          this.error('incompatible types: bad return type in lambda expression\n    missing return value', e.range);
        }
      } else {
        this.expr(e.body as B.BExpr, start);
      }
    } finally {
      Object.assign(this, saved);
    }
    return cur;
  }

  // ── Checked exceptions ──

  private isChecked(c: ClassSymbol): boolean {
    return isSubclass(c, this.lib.throwable) && !isSubclass(c, this.lib.runtimeException) && !isSubclass(c, this.lib.error);
  }

  /** The checked exceptions a `throw` throws: its expression's type, or what a rethrown catch parameter's try block threw. */
  private thrownBy(e: B.BExpr): ClassSymbol[] {
    if (e.kind === 'Local' && e.local.kind === 'catch' && e.local.assignments === 0 && this.rethrows.has(e.local)) {
      return this.rethrows.get(e.local)!;
    }
    return e.type.tag === 'class' ? [e.type.symbol] : [];
  }

  /** A call of a method (or constructor) whose throws clause declares checked exceptions. */
  private calls(m: MethodSymbol, range: A.Range): void {
    const thrown = m.throws.filter((t): t is Extract<JType, { tag: 'class' }> => t.tag === 'class').map(t => t.symbol);
    if (thrown.length) this.throws(thrown, range);
  }

  /** Where javac reports what a call throws: the `(` of its arguments (the last one outside parentheses in its source). */
  private argumentsAt(range: A.Range): A.Range {
    const src = this.source;
    let depth = 0, open = -1;
    for (let i = range.start; i < range.end && i < src.length; i++) {
      const ch = src[i];
      if (ch === '"' || ch === "'") {
        for (i++; i < range.end && src[i] !== ch; i++) if (src[i] === '\\') i++;
      } else if (ch === '(') {
        if (depth === 0) open = i;
        depth++;
      } else if (ch === ')') {
        depth--;
      }
    }
    if (open < 0) return range;
    const before = src.slice(range.start, open);
    const newline = before.lastIndexOf('\n');
    const line = range.line + before.split('\n').length - 1;
    const column = newline < 0 ? range.column + before.length : before.length - newline;
    return { start: open, end: open + 1, line, column, endLine: line, endColumn: column };
  }

  /** try-with-resources closes its resource: what that close() declares is thrown there. */
  private closes(t: JType, range: A.Range): void {
    if (t.tag !== 'class') return;
    for (let c: ClassSymbol | undefined = t.symbol; c; c = c.superclass?.symbol) {
      const close = (c.methods.get('close') ?? []).find(m => m.arity === 0);
      if (close) {
        this.calls(close, range);
        return;
      }
    }
  }

  /**
   * Checked exceptions thrown here: each is caught by an enclosing try's
   * catch (and noted as thrown by its block), or must be declared, else
   * javac's "unreported exception".
   */
  private throws(types: ClassSymbol[], range: A.Range): void {
    for (const x of types) {
      if (!this.isChecked(x)) continue;
      let caught = false;
      for (let i = this.handlers.length - 1; i >= 0 && !caught; i--) {
        this.handlers[i].thrown.push(x);
        caught = this.handlers[i].catches.some(t => isSubclass(x, t));
      }
      if (caught) continue;
      if (this.declared.some(d => d.tag === 'class' && isSubclass(x, d.symbol))) continue;
      if (this.reportUncaught) this.error(`unreported exception ${typeName({ tag: 'class', symbol: x, args: [] })}; must be caught or declared to be thrown`, range);
    }
  }
}

/** A state with what `other` adds (the instance initializers' assignments, after super()). */
function copyWith(s: State, other: State): State {
  const out = copy(s);
  if (out.da !== 'dead' && other.da !== 'dead') for (const x of other.da) out.da.add(x);
  for (const x of other.pa) out.pa.add(x);
  return out;
}

/** The position of a block's closing brace, where javac reports what happens at its end. */
function endOf(r: A.Range): A.Range {
  return { start: r.end - 1, end: r.end, line: r.endLine, column: r.endColumn, endLine: r.endLine, endColumn: r.endColumn };
}

function isLoose(t: JType): boolean {
  return t.tag === 'dynamic' || t.tag === 'error';
}

/** Does a lambda's block return a value somewhere (so it is value-compatible, not void-compatible)? */
function hasValueReturn(block: B.BBlock): boolean {
  const visit = (st: B.BStmt): boolean => {
    switch (st.kind) {
      case 'Return': return st.value !== undefined;
      case 'Block': return st.statements.some(visit);
      case 'If': return visit(st.then) || (st.else !== undefined && visit(st.else));
      case 'While': case 'DoWhile': case 'For': case 'ForEach': case 'Labeled': return visit(st.body);
      case 'Try': return visit(st.block) || st.catches.some(c => visit(c.body)) || (st.finally !== undefined && visit(st.finally));
      case 'Synchronized': return visit(st.body);
      case 'SwitchStmt': return st.switch.cases.some(c => c.body.some(visit));
      default: return false;
    }
  };
  return visit(block);
}
