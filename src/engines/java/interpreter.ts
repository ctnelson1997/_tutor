/**
 * Java AST-Walking Interpreter
 *
 * Walks the Chevrotain CST from java-parser and interprets Java programs,
 * emitting ExecutionSnapshot[] at each statement for visualization.
 *
 * Supports an educational subset of Java: primitives, strings, arrays,
 * static methods, control flow, basic OOP concepts, and common builtins.
 */

import type {
  ExecutionSnapshot,
  StackFrame,
  Variable,
  HeapObject,
  RuntimeValue,
} from '../../types/snapshot';
import {
  type CstNode,
  type CstToken,
  child,
  children,
  token,
  tokens,
  has,
  getLine,
  isCstNode,
  isCstToken,
} from './parser';
import { InterpreterError, nullPointer } from './errors';
import {
  type Reference,
  assignmentConversion,
  slotReference,
  fieldReference,
  arrayElementReference,
  arrayLength,
} from './references';
import {
  type JavaValue,
  type JavaType,
  type JavaHeapEntry,
  type JavaObject,
  isJavaArray,
  isJavaObject,
  defaultValue,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaValuesEqual,
  javaInt,
  javaDouble,
  javaBool,
  javaChar,
  javaString,
  javaNull,
} from './types';
import {
  type StdlibContext,
  HaltSignal,
  StdlibError,
  callStaticMethod,
  getStaticField,
  javaFormat,
  newBuiltin,
  callInstanceMethod,
  getIterableElements,
  LIST_LIKE,
  SET_LIKE,
  MAP_LIKE,
  isExceptionClass,
  newException,
  exceptionMethod,
  exceptionAssignable,
  formatException,
} from './stdlib';

// ── Limits ──

const MAX_SNAPSHOTS = 5000;
const MAX_LOOP_ITERATIONS = 10000;

// ── Control flow signals ──

class ReturnSignal {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

class BreakSignal {}
class ContinueSignal {}

/** A thrown Java exception propagating up the stack until a matching catch. */
class JavaThrow {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

// ── Scope / Environment ──

interface Scope {
  variables: Map<string, { value: JavaValue; type: JavaType }>;
  parent: Scope | null;
  label?: string; // e.g. "for", "while", "if" — used for block scope display
}

function createScope(parent: Scope | null, label?: string): Scope {
  return { variables: new Map(), parent, label };
}

function lookupVariable(scope: Scope, name: string): { value: JavaValue; type: JavaType } | undefined {
  const entry = scope.variables.get(name);
  if (entry) return entry;
  if (scope.parent) return lookupVariable(scope.parent, name);
  return undefined;
}

/**
 * Increment / decrement (`++` / `--`) preserving the operand's numeric type, so
 * `double d = 1.5; d++;` yields 2.5 (not a truncated int). Falls back to int.
 */
function stepValue(val: JavaValue, delta: number): JavaValue {
  const n = javaValueToNumber(val) + delta;
  if (val.kind === 'primitive' && (val.javaType === 'double' || val.javaType === 'float' || val.javaType === 'long')) {
    return { kind: 'primitive', javaType: val.javaType, value: n };
  }
  return javaInt(n);
}

function setVariable(scope: Scope, name: string, value: JavaValue, type: JavaType): void {
  scope.variables.set(name, { value: assignmentConversion(value, type), type });
}

function updateVariable(scope: Scope, name: string, value: JavaValue): boolean {
  if (scope.variables.has(name)) {
    const entry = scope.variables.get(name)!;
    entry.value = assignmentConversion(value, entry.type);
    return true;
  }
  if (scope.parent) return updateVariable(scope.parent, name, value);
  return false;
}

/** Update the innermost call-stack frame's currentScope pointer. */
function setCurrentScope(callStack: { name: string; scope: Scope; currentScope: Scope; className?: string }[], scope: Scope): void {
  if (callStack.length > 0) {
    callStack[callStack.length - 1].currentScope = scope;
  }
}

// ── Method definitions ──

interface MethodDef {
  name: string;
  returnType: JavaType;
  params: { name: string; type: JavaType }[];
  body: CstNode; // the block node
  isStatic: boolean;
  className: string; // the class that declares this method
}

interface FieldDef {
  name: string;
  type: JavaType;
  initializer?: CstNode;
}

interface ConstructorDef {
  className: string;
  params: { name: string; type: JavaType }[];
  body: CstNode;
}

type MethodTable = Map<string, MethodDef[]>;

// ── Interpreter ──

export class JavaInterpreter {
  private snapshots: ExecutionSnapshot[] = [];
  private stdoutBuffer = '';
  private heap: Map<string, JavaHeapEntry> = new Map();
  private nextHeapId = 1;
  private callStack: { name: string; scope: Scope; currentScope: Scope; className?: string }[] = [];
  private methods: MethodTable = new Map();
  private methodsByClass: Map<string, MethodTable> = new Map();
  private staticFields: Scope = createScope(null);
  private instanceFields: Map<string, FieldDef[]> = new Map();
  private constructors: Map<string, ConstructorDef[]> = new Map();
  private classNames: Set<string> = new Set();
  private step = 0;
  private stdin: string;
  private ctx: StdlibContext;
  /** When > 0, emitSnapshot is a no-op (during atomic toString/equals/compareTo callbacks). */
  private suppressSnapshots = 0;
  /** Parsed primary-expression chains, per CST node. */
  private chainCache = new WeakMap<CstNode, PrimaryChain>();

  constructor(stdin: string = '') {
    this.stdin = stdin;
    this.ctx = {
      heap: this.heap,
      allocArray: (elementType, elements) => this.allocArray(elementType, elements),
      allocObject: (className, fields) => this.allocObject(className, fields),
      random: () => Math.random(),
      stdin: this.stdin,
      writeStdout: (text) => this.appendStdout(text),
      invokeUserMethod: (ref, name, args) => this.invokeUser(ref, name, args),
    };
  }

  /**
   * Invoke a user-defined instance method (toString/equals/compareTo/…) and
   * return its result, or undefined if the object's class doesn't define one.
   * Snapshot emission is suppressed so the call is atomic in the visualization.
   */
  private invokeUser(ref: JavaValue, name: string, args: JavaValue[]): JavaValue | undefined {
    if (ref.kind !== 'objectRef' || !this.classNames.has(ref.className)) return undefined;
    const method = this.resolveMethod(this.methodsByClass.get(ref.className), name, args.length);
    if (!method || method.isStatic) return undefined;
    this.suppressSnapshots++;
    try {
      return this.callMethod(method, args, undefined, ref);
    } finally {
      this.suppressSnapshots--;
    }
  }

  /**
   * Convert a value to its display string, honoring a user-defined `toString()`
   * and formatting built-in exceptions as `ClassName: message`. Falls back to
   * `javaValueToString` (which handles collections, StringBuilder, etc.).
   */
  private stringify(value: JavaValue): string {
    if (value.kind === 'objectRef') {
      const user = this.invokeUser(value, 'toString', []);
      if (user !== undefined && user.kind === 'string') return user.value;
      const obj = this.heap.get(value.heapId);
      if (obj && isJavaObject(obj)) {
        // Exceptions render as ClassName: message.
        if (isExceptionClass(value.className) || /(?:Exception|Error)$/.test(value.className)) {
          const exc = formatException(value, this.heap);
          if (exc !== undefined) return exc;
        }
        // Maps: {k=v, ...} — recurse via stringify so element toString() is honored.
        const keysRef = obj.fields.get('__keys__'), valuesRef = obj.fields.get('__values__');
        if (keysRef?.kind === 'arrayRef' && valuesRef?.kind === 'arrayRef') {
          const ks = this.heap.get(keysRef.heapId), vs = this.heap.get(valuesRef.heapId);
          if (ks && isJavaArray(ks) && vs && isJavaArray(vs)) {
            return '{' + ks.elements.map((k, i) => this.stringify(k) + '=' + this.stringify(vs.elements[i])).join(', ') + '}';
          }
        }
        // Lists / sets / queues: [a, b, c]
        const dataRef = obj.fields.get('__data__');
        if (dataRef?.kind === 'arrayRef') {
          const d = this.heap.get(dataRef.heapId);
          if (d && isJavaArray(d)) return '[' + d.elements.map(e => this.stringify(e)).join(', ') + ']';
        }
      }
    }
    return javaValueToString(value, this.heap);
  }

  /** Append raw text to the stdout buffer (used by print / printf). */
  private appendStdout(text: string): void {
    this.stdoutBuffer += text;
  }

  /**
   * Split the accumulated stdout buffer into display lines. One trailing
   * newline is dropped (matching the established convention where a final
   * println doesn't render an extra blank line).
   */
  private snapshotStdout(): string[] {
    if (this.stdoutBuffer === '') return [];
    const s = this.stdoutBuffer.endsWith('\n') ? this.stdoutBuffer.slice(0, -1) : this.stdoutBuffer;
    return s.split('\n');
  }

  execute(cst: CstNode): { snapshots: ExecutionSnapshot[]; error?: string } {
    try {
      const compUnit = child(cst, 'ordinaryCompilationUnit');
      if (!compUnit) throw new InterpreterError('No compilation unit found', 0);

      // A source file may declare more than one top-level class (e.g. a tester
      // class alongside the logic class it exercises). Register every one; each
      // class's methods live in `methodsByClass`, and `ClassName.method()` calls
      // dispatch against that table. `javac` forbids two *public* top-level
      // classes per file, but this educational engine is lenient about it.
      const typeDecls = children(compUnit, 'typeDeclaration');
      const classNamesInOrder: string[] = [];
      for (const typeDecl of typeDecls) {
        const classDecl = child(typeDecl, 'classDeclaration');
        if (!classDecl) continue; // skip interfaces / enums / stray semicolons
        const normalClass = child(classDecl, 'normalClassDeclaration');
        if (normalClass) classNamesInOrder.push(this.registerClass(normalClass));
      }
      if (classNamesInOrder.length === 0) {
        throw new InterpreterError('No class declaration found', 0);
      }

      // The entry class is the first top-level class that declares a static
      // `main`. Its methods become callable unqualified (so single-class
      // programs behave exactly as before).
      let entryClass: string | undefined;
      for (const name of classNamesInOrder) {
        const main = this.resolveMethod(this.methodsByClass.get(name), 'main', 1)
          || this.resolveMethod(this.methodsByClass.get(name), 'main', 0);
        if (main && main.isStatic) { entryClass = name; break; }
      }
      if (!entryClass) throw new InterpreterError('No main method found', 0);
      this.methods = this.methodsByClass.get(entryClass) ?? new Map();

      // Initialize static fields
      this.initStaticFields();

      // Find and run main
      const mainMethod = this.resolveMethod(this.methods, 'main', 1) || this.resolveMethod(this.methods, 'main', 0);
      if (!mainMethod) throw new InterpreterError('No main method found', 0);

      const mainScope = createScope(this.staticFields);
      this.callStack.push({ name: 'main', scope: mainScope, currentScope: mainScope, className: entryClass });
      this.executeBlock(mainMethod.body, mainScope);
      this.callStack.pop();

      return { snapshots: this.snapshots };
    } catch (e) {
      if (e instanceof InterpreterError) {
        return {
          snapshots: this.snapshots,
          error: e.message,
        };
      }
      if (e instanceof ReturnSignal) {
        return { snapshots: this.snapshots };
      }
      if (e instanceof HaltSignal) {
        // System.exit(...) — clean stop, return snapshots gathered so far.
        return { snapshots: this.snapshots };
      }
      if (e instanceof JavaThrow) {
        const s = formatException(e.value, this.heap) ?? this.stringify(e.value);
        return { snapshots: this.snapshots, error: `Exception in thread "main" ${s}` };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { snapshots: this.snapshots, error: msg };
    }
  }

  // ── Method registration ──

  private registerClass(normalClass: CstNode): string {
    const className = this.extractClassName(normalClass);
    this.classNames.add(className);
    const classBody = child(normalClass, 'classBody');
    if (!classBody) throw new InterpreterError('Empty class body', getLine(normalClass));

    const bodyDecls = children(classBody, 'classBodyDeclaration');
    for (const bodyDecl of bodyDecls) {
      const constructorDecl = child(bodyDecl, 'constructorDeclaration');
      if (constructorDecl) {
        this.registerConstructor(className, constructorDecl);
        continue;
      }

      const memberDecl = child(bodyDecl, 'classMemberDeclaration');
      if (!memberDecl) continue;

      const nestedClassDecl = child(memberDecl, 'classDeclaration');
      const nestedNormalClass = nestedClassDecl ? child(nestedClassDecl, 'normalClassDeclaration') : undefined;
      if (nestedNormalClass) {
        this.registerClass(nestedNormalClass);
        continue;
      }

      const methodDecl = child(memberDecl, 'methodDeclaration');
      if (methodDecl) {
        this.registerMethod(className, methodDecl);
        continue;
      }

      const fieldDecl = child(memberDecl, 'fieldDeclaration');
      if (fieldDecl) {
        if (this.isStaticField(fieldDecl)) {
          this.registerStaticField(fieldDecl);
        } else {
          this.registerInstanceField(className, fieldDecl);
        }
      }
    }
    return className;
  }

  private registerMethod(className: string, methodDecl: CstNode): void {
    const header = child(methodDecl, 'methodHeader')!;
    const declarator = child(header, 'methodDeclarator')!;
    const nameToken = token(declarator, 'Identifier')!;
    const methodName = nameToken.image;

    const result = child(header, 'result');
    const returnType = result ? this.extractResultType(result) : 'void';

    const paramList = child(declarator, 'formalParameterList');
    const params = this.extractFormalParameters(paramList);

    const body = child(child(methodDecl, 'methodBody')!, 'block')!;
    const modifiers = children(methodDecl, 'methodModifier');
    const isStatic = modifiers.some(m => has(m, 'Static'));

    const method: MethodDef = { name: methodName, returnType, params, body, isStatic, className };
    const classMethods = this.methodsByClass.get(className) || new Map<string, MethodDef[]>();
    const overloads = classMethods.get(methodName) || [];
    overloads.push(method);
    classMethods.set(methodName, overloads);
    this.methodsByClass.set(className, classMethods);
  }

  private resolveMethod(table: MethodTable | undefined, methodName: string, argCount: number): MethodDef | undefined {
    const overloads = table?.get(methodName);
    if (!overloads || overloads.length === 0) return undefined;
    return overloads.find(method => method.params.length === argCount) || overloads[0];
  }

  private extractClassName(normalClass: CstNode): string {
    const typeIdentifier = child(normalClass, 'typeIdentifier');
    return token(typeIdentifier || normalClass, 'Identifier')?.image || 'Main';
  }

  private registerConstructor(className: string, ctorDecl: CstNode): void {
    const declarator = child(ctorDecl, 'constructorDeclarator')!;
    const simpleTypeName = child(declarator, 'simpleTypeName');
    const typeIdentifier = simpleTypeName ? child(simpleTypeName, 'typeIdentifier') : undefined;
    const nameToken = typeIdentifier ? token(typeIdentifier, 'Identifier') : undefined;
    const ctorName = nameToken?.image || className;
    const paramList = child(declarator, 'formalParameterList');
    const params = this.extractFormalParameters(paramList);
    const body = child(ctorDecl, 'constructorBody')!;
    const constructors = this.constructors.get(className) || [];
    constructors.push({ className: ctorName, params, body });
    this.constructors.set(className, constructors);
  }

  private extractFormalParameters(paramList: CstNode | undefined): { name: string; type: JavaType }[] {
    const params: { name: string; type: JavaType }[] = [];
    if (!paramList) return params;

    const formalParams = children(paramList, 'formalParameter');
    for (const fp of formalParams) {
      const regularParam = child(fp, 'variableParaRegularParameter');
      if (regularParam) {
        const paramType = this.extractUnannType(child(regularParam, 'unannType'));
        const paramId = child(regularParam, 'variableDeclaratorId');
        const paramName = paramId ? token(paramId, 'Identifier')?.image || 'unknown' : 'unknown';
        // Check for array dims on the parameter
        const hasDims = paramId && has(paramId, 'dims');
        params.push({ name: paramName, type: hasDims ? paramType + '[]' : paramType });
      }
    }

    return params;
  }

  private registerStaticField(fieldDecl: CstNode): void {
    const type = this.extractUnannType(child(fieldDecl, 'unannType'));
    const declList = child(fieldDecl, 'variableDeclaratorList');
    if (!declList) return;
    const hasDims = has(fieldDecl, 'dims');

    for (const decl of children(declList, 'variableDeclarator')) {
      const idNode = child(decl, 'variableDeclaratorId');
      const name = idNode ? token(idNode, 'Identifier')?.image || 'unknown' : 'unknown';
      const declHasDims = idNode && has(idNode, 'dims');
      const finalType = (hasDims || declHasDims) ? type + '[]' : type;
      const init = child(decl, 'variableInitializer');
      setVariable(this.staticFields, name, defaultValue(finalType), finalType);
      if (init) {
        // Store the initializer node for later execution
        (this.staticFields.variables.get(name) as unknown as { initializer?: CstNode }).initializer = init;
      }
    }
  }

  private isStaticField(fieldDecl: CstNode): boolean {
    return children(fieldDecl, 'fieldModifier').some(modifier => has(modifier, 'Static'));
  }

  private registerInstanceField(className: string, fieldDecl: CstNode): void {
    const type = this.extractUnannType(child(fieldDecl, 'unannType'));
    const declList = child(fieldDecl, 'variableDeclaratorList');
    if (!declList) return;
    const hasDims = has(fieldDecl, 'dims');
    const fields = this.instanceFields.get(className) || [];

    for (const decl of children(declList, 'variableDeclarator')) {
      const idNode = child(decl, 'variableDeclaratorId');
      const name = idNode ? token(idNode, 'Identifier')?.image || 'unknown' : 'unknown';
      const declHasDims = idNode && has(idNode, 'dims');
      const finalType = (hasDims || declHasDims) ? type + '[]' : type;
      const initializer = child(decl, 'variableInitializer');
      fields.push({ name, type: finalType, initializer });
    }

    this.instanceFields.set(className, fields);
  }

  private initStaticFields(): void {
    for (const entry of this.staticFields.variables.values()) {
      const asAny = entry as unknown as { initializer?: CstNode };
      if (asAny.initializer) {
        const val = this.evalVariableInitializer(asAny.initializer, entry.type, this.staticFields);
        entry.value = val;
        delete asAny.initializer;
      }
    }
  }

  private createInstanceFields(className: string, scope: Scope): Map<string, JavaValue> {
    const fields = new Map<string, JavaValue>();
    for (const field of this.instanceFields.get(className) || []) {
      const value = field.initializer
        ? this.evalVariableInitializer(field.initializer, field.type, scope)
        : defaultValue(field.type);
      fields.set(field.name, value);
    }
    return fields;
  }

  // ── Type extraction ──

  private extractResultType(result: CstNode): JavaType {
    if (has(result, 'Void')) return 'void';
    const unannType = child(result, 'unannType');
    return unannType ? this.extractUnannType(unannType) : 'void';
  }

  private extractUnannType(unannType: CstNode | undefined): JavaType {
    if (!unannType) return 'int';

    // Primitive types
    const primWithDims = child(unannType, 'unannPrimitiveTypeWithOptionalDimsSuffix');
    if (primWithDims) {
      const prim = child(primWithDims, 'unannPrimitiveType');
      const hasDims = has(primWithDims, 'dims');
      const baseType = this.extractPrimitiveType(prim);
      return hasDims ? baseType + '[]' : baseType;
    }

    // Reference types (String, class names, arrays of references)
    const refType = child(unannType, 'unannReferenceType');
    if (refType) {
      const classType = child(refType, 'unannClassOrInterfaceType');
      if (classType) {
        const unannClass = child(classType, 'unannClassType');
        if (unannClass) {
          const id = token(unannClass, 'Identifier');
          return id?.image || 'Object';
        }
      }
    }

    return 'Object';
  }

  private extractPrimitiveType(primitiveType: CstNode | undefined): JavaType {
    if (!primitiveType) return 'int';
    if (has(primitiveType, 'Boolean')) return 'boolean';
    const numeric = child(primitiveType, 'numericType');
    if (numeric) {
      const integral = child(numeric, 'integralType');
      if (integral) {
        if (has(integral, 'Int')) return 'int';
        if (has(integral, 'Long')) return 'long';
        if (has(integral, 'Byte')) return 'byte';
        if (has(integral, 'Short')) return 'short';
        if (has(integral, 'Char')) return 'char';
      }
      const fp = child(numeric, 'floatingPointType');
      if (fp) {
        if (has(fp, 'Float')) return 'float';
        if (has(fp, 'Double')) return 'double';
      }
    }
    return 'int';
  }

  private extractLocalVarType(localVarType: CstNode): JavaType {
    const unannType = child(localVarType, 'unannType');
    if (unannType) return this.extractUnannType(unannType);
    if (has(localVarType, 'Var')) return 'var';
    return 'Object';
  }

  // ── Snapshot emission ──

  private emitSnapshot(line: number): void {
    // Suppressed during atomic user-method callbacks (toString/equals/compareTo).
    if (this.suppressSnapshots > 0) return;
    if (this.snapshots.length >= MAX_SNAPSHOTS) {
      throw new InterpreterError(
        `Execution exceeded ${MAX_SNAPSHOTS} steps. Your code may contain an infinite loop.`,
        line,
      );
    }

    const callStack: StackFrame[] = [];
    for (const frame of this.callStack) {
      // Emit the frame's root scope variables (the method-level variables)
      const rootVars: Variable[] = [];
      for (const [name, entry] of frame.scope.variables) {
        rootVars.push({ name, value: this.javaToRuntime(entry.value) });
      }
      callStack.push({ name: frame.name, variables: rootVars });

      // Walk from currentScope up to (but not including) frame.scope,
      // emitting each intermediate scope as a block-scope frame.
      const blockScopes: Scope[] = [];
      let s: Scope | null = frame.currentScope;
      while (s && s !== frame.scope) {
        blockScopes.push(s);
        s = s.parent;
      }
      // Emit in outer-to-inner order (reverse of how we collected them).
      // Merge a child scope into its parent's block frame when both share
      // the same label (e.g. for-init scope + for-body block scope both
      // labeled "for"), so `i` and `abc` appear together in one "for block".
      let lastEmittedScope: Scope | null = null;
      for (let i = blockScopes.length - 1; i >= 0; i--) {
        const scopeLabel = blockScopes[i].label || frame.name;
        const blockVars: Variable[] = [];
        for (const [name, entry] of blockScopes[i].variables) {
          blockVars.push({ name, value: this.javaToRuntime(entry.value) });
        }
        // Merge into previous block frame if same label AND direct child
        const prev = callStack.length > 0 ? callStack[callStack.length - 1] : null;
        const isDirectChild = lastEmittedScope && blockScopes[i].parent === lastEmittedScope;
        if (prev && prev.isBlockScope && prev.name === scopeLabel && isDirectChild) {
          prev.variables.push(...blockVars);
        } else if (blockVars.length > 0) {
          callStack.push({ name: scopeLabel, variables: blockVars, isBlockScope: true });
          lastEmittedScope = blockScopes[i];
        } else {
          lastEmittedScope = blockScopes[i];
        }
      }
    }

    // Collections store their contents in backing arrays (__data__ / __keys__ /
    // __values__). Collect those array ids so we can render their contents
    // inline on the collection object and omit the raw backing arrays.
    const internalArrayIds = new Set<string>();
    for (const [, entry] of this.heap) {
      if (isJavaObject(entry)) {
        for (const key of ['__data__', '__keys__', '__values__']) {
          const r = entry.fields.get(key);
          if (r && r.kind === 'arrayRef') internalArrayIds.add(r.heapId);
        }
      }
    }

    const heapObjects: HeapObject[] = [];
    for (const [id, entry] of this.heap) {
      if (isJavaArray(entry)) {
        if (internalArrayIds.has(id)) continue; // shown via its owning collection
        heapObjects.push({
          id,
          objectType: 'array',
          label: entry.elementType + '[]',
          properties: entry.elements.map((el, i) => ({
            key: String(i),
            value: this.javaToRuntime(el),
          })),
        });
      } else if (isJavaObject(entry)) {
        heapObjects.push(this.serializeObject(id, entry));
      }
    }

    this.snapshots.push({
      step: this.step++,
      line,
      callStack,
      heap: heapObjects,
      stdout: this.snapshotStdout(),
    });
  }


  private javaToRuntime(val: JavaValue): RuntimeValue {
    switch (val.kind) {
      case 'primitive':
        if (val.javaType === 'boolean')
          return { type: 'boolean', value: val.value as boolean };
        if (val.javaType === 'char')
          return { type: 'string', value: String.fromCharCode(val.value as number) };
        return { type: 'number', value: val.value as number };
      case 'string':
        return { type: 'string', value: val.value };
      case 'null':
        return { type: 'null', value: null };
      case 'arrayRef':
        return { type: 'ref', heapId: val.heapId };
      case 'objectRef':
        return { type: 'ref', heapId: val.heapId };
    }
  }

  /**
   * Render a heap object for a snapshot. Built-in collections show their
   * contents inline (with list/set/map objectTypes); StringBuilder shows its
   * text; generic objects hide internal `__`-prefixed fields.
   */
  private serializeObject(id: string, entry: JavaObject): HeapObject {
    const cls = entry.className;
    if (MAP_LIKE.has(cls)) {
      const keys = this.getBackingElements(entry, '__keys__');
      const values = this.getBackingElements(entry, '__values__');
      return {
        id, objectType: 'map', label: cls,
        properties: keys.map((k, i) => ({
          key: javaValueToString(k, this.heap),
          value: this.javaToRuntime(values[i] ?? javaNull()),
        })),
      };
    }
    if (LIST_LIKE.has(cls) || SET_LIKE.has(cls)) {
      const elems = this.getBackingElements(entry, '__data__');
      return {
        id, objectType: SET_LIKE.has(cls) ? 'set' : 'list', label: cls,
        properties: elems.map((e, i) => ({ key: String(i), value: this.javaToRuntime(e) })),
      };
    }
    if (cls === 'StringBuilder' || cls === 'StringBuffer') {
      return {
        id, objectType: 'object', label: cls,
        properties: [{ key: 'value', value: this.javaToRuntime(entry.fields.get('value') ?? javaNull()) }],
      };
    }
    return {
      id, objectType: 'object', label: cls,
      properties: Array.from(entry.fields.entries())
        .filter(([k]) => !k.startsWith('__'))
        .map(([k, v]) => ({ key: k, value: this.javaToRuntime(v) })),
    };
  }

  private getBackingElements(entry: JavaObject, field: string): JavaValue[] {
    const ref = entry.fields.get(field);
    if (ref && ref.kind === 'arrayRef') {
      const arr = this.heap.get(ref.heapId);
      if (arr && isJavaArray(arr)) return arr.elements;
    }
    return [];
  }

  // ── Heap management ──

  private allocArray(elementType: JavaType, elements: JavaValue[]): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, { elementType, elements });
    return id;
  }

  private allocObject(className: string, fields: Map<string, JavaValue>): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, { className, fields });
    return id;
  }

  // ── Block execution ──

  private executeBlock(block: CstNode, scope: Scope): void {
    const stmts = child(block, 'blockStatements');
    if (!stmts) return;
    const blockStmts = children(stmts, 'blockStatement');
    for (const stmt of blockStmts) {
      this.executeBlockStatement(stmt, scope);
    }
  }

  private executeBlockStatement(blockStmt: CstNode, scope: Scope): void {
    // Local variable declaration
    const localVarDeclStmt = child(blockStmt, 'localVariableDeclarationStatement');
    if (localVarDeclStmt) {
      this.executeLocalVarDecl(localVarDeclStmt, scope);
      return;
    }

    // Statement
    const stmt = child(blockStmt, 'statement');
    if (stmt) {
      this.executeStatement(stmt, scope);
    }
  }

  // ── Local variable declarations ──

  private executeLocalVarDecl(declStmt: CstNode, scope: Scope): void {
    const decl = child(declStmt, 'localVariableDeclaration')!;
    const typeNode = child(decl, 'localVariableType')!;
    let type = this.extractLocalVarType(typeNode);

    const declList = child(decl, 'variableDeclaratorList')!;
    for (const declarator of children(declList, 'variableDeclarator')) {
      const idNode = child(declarator, 'variableDeclaratorId')!;
      const name = token(idNode, 'Identifier')!.image;
      const line = token(idNode, 'Identifier')!.startLine;

      // Check for array dims on the variable name (e.g., int nums[])
      if (has(idNode, 'dims')) {
        type = type + '[]';
      }

      const init = child(declarator, 'variableInitializer');
      let value: JavaValue;
      if (init) {
        value = this.evalVariableInitializer(init, type, scope);
      } else {
        value = defaultValue(type);
      }

      // Infer type for 'var'
      if (type === 'var') {
        type = this.inferType(value);
      }

      setVariable(scope, name, value, type);
      this.emitSnapshot(line);
    }
  }

  private evalVariableInitializer(init: CstNode, type: JavaType, scope: Scope): JavaValue {
    // Array initializer: {1, 2, 3}
    const arrayInit = child(init, 'arrayInitializer');
    if (arrayInit) {
      return this.evalArrayInitializer(arrayInit, type, scope);
    }

    // Expression
    const expr = child(init, 'expression');
    if (expr) {
      return this.evalExpression(expr, scope);
    }

    return defaultValue(type);
  }

  private evalArrayInitializer(arrayInit: CstNode, type: JavaType, scope: Scope): JavaValue {
    const elementType = type.endsWith('[]') ? type.slice(0, -2) : type;
    const initList = child(arrayInit, 'variableInitializerList');
    const elements: JavaValue[] = [];

    if (initList) {
      for (const vi of children(initList, 'variableInitializer')) {
        // Could be nested array initializer for 2D arrays
        const nestedArrayInit = child(vi, 'arrayInitializer');
        if (nestedArrayInit) {
          elements.push(this.evalArrayInitializer(nestedArrayInit, elementType, scope));
        } else {
          const expr = child(vi, 'expression');
          if (expr) elements.push(this.evalExpression(expr, scope));
        }
      }
    }

    const heapId = this.allocArray(elementType, elements);
    return { kind: 'arrayRef', heapId };
  }

  private inferType(val: JavaValue): JavaType {
    switch (val.kind) {
      case 'primitive': return val.javaType;
      case 'string': return 'String';
      case 'null': return 'Object';
      case 'arrayRef': return 'Object[]';
      case 'objectRef': return val.className;
    }
  }

  // ── Statement execution ──

  private executeStatement(stmt: CstNode, scope: Scope): void {
    // if statement
    if (has(stmt, 'ifStatement')) {
      this.executeIf(child(stmt, 'ifStatement')!, scope);
      return;
    }

    // for statement
    if (has(stmt, 'forStatement')) {
      this.executeFor(child(stmt, 'forStatement')!, scope);
      return;
    }

    // while statement
    if (has(stmt, 'whileStatement')) {
      this.executeWhile(child(stmt, 'whileStatement')!, scope);
      return;
    }

    // Note: do-while is handled via statementWithoutTrailingSubstatement > doStatement

    // statementWithoutTrailingSubstatement
    const swts = child(stmt, 'statementWithoutTrailingSubstatement');
    if (swts) {
      this.executeStatementWithoutTrailing(swts, scope);
    }
  }

  private executeStatementWithoutTrailing(swts: CstNode, scope: Scope): void {
    // block
    const block = child(swts, 'block');
    if (block) {
      // Inherit the parent scope's label so variables declared inside
      // a for/while/if body block show the correct scope name.
      const innerScope = createScope(scope, scope.label);
      setCurrentScope(this.callStack, innerScope);
      this.executeBlock(block, innerScope);
      setCurrentScope(this.callStack, scope);
      return;
    }

    // expression statement
    const exprStmt = child(swts, 'expressionStatement');
    if (exprStmt) {
      const stmtExpr = child(exprStmt, 'statementExpression')!;
      const expr = child(stmtExpr, 'expression')!;
      const line = getLine(expr);
      this.evalExpression(expr, scope);
      this.emitSnapshot(line);
      return;
    }

    // return statement
    const returnStmt = child(swts, 'returnStatement');
    if (returnStmt) {
      const line = token(returnStmt, 'Return')?.startLine || getLine(returnStmt);
      const expr = child(returnStmt, 'expression');
      const value = expr ? this.evalExpression(expr, scope) : javaNull();
      this.emitSnapshot(line);
      throw new ReturnSignal(value);
    }

    // break statement
    const breakStmt = child(swts, 'breakStatement');
    if (breakStmt) {
      const line = token(breakStmt, 'Break')?.startLine || getLine(breakStmt);
      this.emitSnapshot(line);
      throw new BreakSignal();
    }

    // continue statement
    const continueStmt = child(swts, 'continueStatement');
    if (continueStmt) {
      const line = token(continueStmt, 'Continue')?.startLine || getLine(continueStmt);
      this.emitSnapshot(line);
      throw new ContinueSignal();
    }

    // switch statement
    const switchStmt = child(swts, 'switchStatement');
    if (switchStmt) {
      this.executeSwitch(switchStmt, scope);
      return;
    }

    // do-while statement (called 'doStatement' in the CST)
    const doStmt = child(swts, 'doStatement');
    if (doStmt) {
      this.executeDoWhile(doStmt, scope);
      return;
    }

    // throw statement
    const throwStmt = child(swts, 'throwStatement');
    if (throwStmt) {
      const line = token(throwStmt, 'Throw')?.startLine || getLine(throwStmt);
      const expr = child(throwStmt, 'expression')!;
      const value = this.evalExpression(expr, scope);
      this.emitSnapshot(line);
      throw new JavaThrow(value);
    }

    // try / catch / finally
    const tryStmt = child(swts, 'tryStatement');
    if (tryStmt) {
      this.executeTry(tryStmt, scope);
      return;
    }
  }

  // ── Exceptions ──

  private executeTry(tryStmt: CstNode, scope: Scope): void {
    const tryBlock = child(tryStmt, 'block');
    const catches = child(tryStmt, 'catches');
    const finallyNode = child(tryStmt, 'finally');
    const finallyBlock = finallyNode ? child(finallyNode, 'block') : undefined;

    const runBlock = (block: CstNode) => {
      const inner = createScope(scope, scope.label);
      setCurrentScope(this.callStack, inner);
      this.executeBlock(block, inner);
      setCurrentScope(this.callStack, scope);
    };
    const runFinally = () => { if (finallyBlock) runBlock(finallyBlock); };

    try {
      if (tryBlock) runBlock(tryBlock);
    } catch (e) {
      // Control-flow signals (return/break/continue/exit) still run finally, then propagate.
      if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof HaltSignal) {
        runFinally();
        throw e;
      }
      // Otherwise treat as a (Java) exception and look for a matching catch.
      const exc = this.toExceptionValue(e);
      const clause = exc && catches ? this.matchCatch(catches, exc) : undefined;
      if (exc && clause) {
        try {
          const catchScope = createScope(scope, scope.label);
          setVariable(catchScope, clause.name, exc, exc.kind === 'objectRef' ? exc.className : 'Exception');
          setCurrentScope(this.callStack, catchScope);
          this.executeBlock(clause.block, catchScope);
          setCurrentScope(this.callStack, scope);
        } finally {
          runFinally();
        }
        return;
      }
      runFinally();
      throw e; // unmatched (or non-Java) error: preserve original propagation
    }
    runFinally();
  }

  /**
   * Convert a thrown JS value into the Java exception object a catch clause can
   * bind — either an explicit `throw`n value, or a synthesized object for a
   * built-in runtime error (ArithmeticException, ArrayIndexOutOfBounds, …).
   * Returns null for interpreter-internal errors that aren't real Java
   * exceptions (so they keep propagating as engine errors).
   */
  private toExceptionValue(e: unknown): JavaValue | null {
    if (e instanceof JavaThrow) return e.value;
    if (e instanceof InterpreterError || e instanceof StdlibError) {
      // InterpreterError prefixes "Line N: "; strip it before matching the type.
      const msg = e.message.replace(/^Line \d+:\s*/, '');
      const m = msg.match(/^([A-Za-z_][A-Za-z0-9_]*)(?::\s*(.*))?$/s);
      if (m && isExceptionClass(m[1])) {
        const detail = m[2] ?? '';
        return newException(m[1], detail ? [javaString(detail)] : [], this.ctx);
      }
    }
    return null;
  }

  private matchCatch(catches: CstNode, exc: JavaValue): { name: string; block: CstNode } | undefined {
    const actual = exc.kind === 'objectRef' ? exc.className : 'Exception';
    for (const clause of children(catches, 'catchClause')) {
      const param = child(clause, 'catchFormalParameter');
      if (!param) continue;
      const catchType = child(param, 'catchType');
      const types = catchType ? this.extractCatchTypes(catchType) : [];
      const name = token(child(param, 'variableDeclaratorId')!, 'Identifier')?.image || 'e';
      const block = child(clause, 'block');
      if (block && types.some(t => exceptionAssignable(actual, t))) {
        return { name, block };
      }
    }
    return undefined;
  }

  private extractCatchTypes(catchType: CstNode): string[] {
    const types: string[] = [];
    const unann = child(catchType, 'unannClassType');
    if (unann) { const id = token(unann, 'Identifier'); if (id) types.push(id.image); }
    for (const ct of children(catchType, 'classType')) {
      const id = token(ct, 'Identifier');
      if (id) types.push(id.image);
    }
    return types;
  }

  // ── Control flow ──

  private executeIf(ifStmt: CstNode, scope: Scope): void {
    const line = token(ifStmt, 'If')?.startLine || getLine(ifStmt);
    const condition = child(ifStmt, 'expression')!;
    const condValue = this.evalExpression(condition, scope);
    const condBool = javaValueToBoolean(condValue);

    this.emitSnapshot(line);

    const stmts = children(ifStmt, 'statement');
    if (condBool) {
      if (stmts.length > 0) {
        const thenScope = createScope(scope, 'if');
        setCurrentScope(this.callStack, thenScope);
        this.executeStatement(stmts[0], thenScope);
      }
    } else {
      if (stmts.length > 1) {
        const elseScope = createScope(scope, 'else');
        setCurrentScope(this.callStack, elseScope);
        this.executeStatement(stmts[1], elseScope);
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeFor(forStmt: CstNode, scope: Scope): void {
    // Enhanced for loop
    const enhanced = child(forStmt, 'enhancedForStatement');
    if (enhanced) {
      this.executeEnhancedFor(enhanced, scope);
      return;
    }

    // Basic for loop
    const basic = child(forStmt, 'basicForStatement');
    if (basic) {
      this.executeBasicFor(basic, scope);
    }
  }

  private executeBasicFor(basic: CstNode, scope: Scope): void {
    const forScope = createScope(scope, 'for');
    setCurrentScope(this.callStack, forScope);
    const line = token(basic, 'For')?.startLine || getLine(basic);

    // Init
    const forInit = child(basic, 'forInit');
    if (forInit) {
      const localVarDecl = child(forInit, 'localVariableDeclaration');
      if (localVarDecl) {
        this.executeForLocalVarDecl(localVarDecl, forScope, line);
      } else {
        // Expression statement list
        const exprList = child(forInit, 'statementExpressionList');
        if (exprList) {
          for (const stmtExpr of children(exprList, 'statementExpression')) {
            const expr = child(stmtExpr, 'expression');
            if (expr) this.evalExpression(expr, forScope);
          }
          this.emitSnapshot(line);
        }
      }
    }

    let iterations = 0;
    while (true) {
      if (iterations++ > MAX_LOOP_ITERATIONS) {
        throw new InterpreterError('Loop exceeded maximum iterations. Possible infinite loop.', line);
      }

      // Condition
      setCurrentScope(this.callStack, forScope);
      const condExpr = child(basic, 'expression');
      if (condExpr) {
        const condValue = this.evalExpression(condExpr, forScope);
        this.emitSnapshot(line);
        if (!javaValueToBoolean(condValue)) break;
      }

      // Body — execute directly in forScope; the block's { } will create
      // its own child scope via executeStatementWithoutTrailing, so there's
      // no need for an extra wrapper scope here.
      const bodyStmt = child(basic, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, forScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) { /* fall through to update */ }
          else throw e;
        }
      }

      // Update
      setCurrentScope(this.callStack, forScope);
      const forUpdate = child(basic, 'forUpdate');
      if (forUpdate) {
        const exprList = child(forUpdate, 'statementExpressionList');
        if (exprList) {
          for (const stmtExpr of children(exprList, 'statementExpression')) {
            const expr = child(stmtExpr, 'expression');
            if (expr) this.evalExpression(expr, forScope);
          }
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeForLocalVarDecl(decl: CstNode, scope: Scope, line: number): void {
    const typeNode = child(decl, 'localVariableType')!;
    let type = this.extractLocalVarType(typeNode);
    const declList = child(decl, 'variableDeclaratorList')!;

    for (const declarator of children(declList, 'variableDeclarator')) {
      const idNode = child(declarator, 'variableDeclaratorId')!;
      const name = token(idNode, 'Identifier')!.image;
      if (has(idNode, 'dims')) type = type + '[]';
      const init = child(declarator, 'variableInitializer');
      const value = init ? this.evalVariableInitializer(init, type, scope) : defaultValue(type);
      setVariable(scope, name, value, type);
    }
    this.emitSnapshot(line);
  }

  private executeEnhancedFor(enhanced: CstNode, scope: Scope): void {
    const forScope = createScope(scope, 'for');
    setCurrentScope(this.callStack, forScope);
    const line = token(enhanced, 'For')?.startLine || getLine(enhanced);

    // Get the loop variable
    const localVarDecl = child(enhanced, 'localVariableDeclaration')!;
    const typeNode = child(localVarDecl, 'localVariableType')!;
    const type = this.extractLocalVarType(typeNode);
    const declList = child(localVarDecl, 'variableDeclaratorList')!;
    const declarator = children(declList, 'variableDeclarator')[0];
    const idNode = child(declarator, 'variableDeclaratorId')!;
    const varName = token(idNode, 'Identifier')!.image;

    // Get the iterable expression
    const iterExpr = child(enhanced, 'expression')!;
    const iterValue = this.evalExpression(iterExpr, scope);

    let iterElements: JavaValue[];
    if (iterValue.kind === 'arrayRef') {
      const arr = this.heap.get(iterValue.heapId);
      if (!arr || !isJavaArray(arr)) {
        throw new InterpreterError('Enhanced for loop target is not an array', line);
      }
      iterElements = arr.elements;
    } else {
      // Collections (ArrayList, HashSet, keySet()/values()/entrySet() results, …)
      const collected = iterValue.kind === 'objectRef' ? getIterableElements(iterValue, this.ctx) : undefined;
      if (!collected) {
        throw new InterpreterError('Enhanced for loop requires an array or collection', line);
      }
      iterElements = collected;
    }

    setVariable(forScope, varName, defaultValue(type), type);
    let iterations = 0;

    for (const element of iterElements) {
      if (iterations++ > MAX_LOOP_ITERATIONS) {
        throw new InterpreterError('Loop exceeded maximum iterations.', line);
      }

      updateVariable(forScope, varName, element);
      this.emitSnapshot(line);

      const bodyStmt = child(enhanced, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, forScope);
        } catch (e) {
          if (e instanceof BreakSignal) { setCurrentScope(this.callStack, scope); return; }
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeWhile(whileStmt: CstNode, scope: Scope): void {
    const line = token(whileStmt, 'While')?.startLine || getLine(whileStmt);
    // Labeled scope so body variables show as "while block"
    const whileScope = createScope(scope, 'while');
    let iterations = 0;

    while (true) {
      if (iterations++ > MAX_LOOP_ITERATIONS) {
        throw new InterpreterError('Loop exceeded maximum iterations. Possible infinite loop.', line);
      }

      setCurrentScope(this.callStack, scope);
      const condExpr = child(whileStmt, 'expression')!;
      const condValue = this.evalExpression(condExpr, scope);
      this.emitSnapshot(line);
      if (!javaValueToBoolean(condValue)) break;

      const bodyStmt = child(whileStmt, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, whileScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeDoWhile(doWhileStmt: CstNode, scope: Scope): void {
    const line = token(doWhileStmt, 'Do')?.startLine || getLine(doWhileStmt);
    const doScope = createScope(scope, 'do-while');
    let iterations = 0;
    let shouldContinue = true;

    do {
      if (iterations++ > MAX_LOOP_ITERATIONS) {
        throw new InterpreterError('Loop exceeded maximum iterations. Possible infinite loop.', line);
      }

      const bodyStmt = child(doWhileStmt, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, doScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (!(e instanceof ContinueSignal)) throw e;
        }
      }

      setCurrentScope(this.callStack, scope);
      const condExpr = child(doWhileStmt, 'expression')!;
      const condValue = this.evalExpression(condExpr, scope);
      this.emitSnapshot(line);
      shouldContinue = javaValueToBoolean(condValue);
    } while (shouldContinue);
    setCurrentScope(this.callStack, scope);
  }

  private executeSwitch(switchStmt: CstNode, scope: Scope): void {
    const line = token(switchStmt, 'Switch')?.startLine || getLine(switchStmt);
    const switchExpr = child(switchStmt, 'expression')!;
    const switchValue = this.evalExpression(switchExpr, scope);
    this.emitSnapshot(line);

    const switchBlock = child(switchStmt, 'switchBlock');
    if (!switchBlock) return;

    const groups = children(switchBlock, 'switchBlockStatementGroup');
    let matched = false;
    let falling = false;

    for (const group of groups) {
      const labels = children(group, 'switchLabel');
      if (!falling) {
        let labelMatches = false;
        for (const label of labels) {
          if (has(label, 'Default')) {
            labelMatches = true;
            break;
          }
          const caseConst = child(label, 'caseConstant');
          if (caseConst) {
            // caseConstant > conditionalExpression > ...
            const condExpr = child(caseConst, 'conditionalExpression');
            if (condExpr) {
              const caseValue = this.evalConditionalExpression(condExpr, scope);
              if (javaValuesEqual(switchValue, caseValue)) {
                labelMatches = true;
                break;
              }
            }
          }
        }
        if (!labelMatches) continue;
        matched = true;
      }

      falling = true;

      // Execute block statements in this group
      const stmts = child(group, 'blockStatements');
      if (stmts) {
        try {
          for (const blockStmt of children(stmts, 'blockStatement')) {
            this.executeBlockStatement(blockStmt, scope);
          }
        } catch (e) {
          if (e instanceof BreakSignal) return;
          throw e;
        }
      }
    }

    // If nothing matched, check for default as a standalone rule
    if (!matched) {
      for (const group of groups) {
        const labels = children(group, 'switchLabel');
        const isDefault = labels.some(l => has(l, 'Default'));
        if (isDefault) {
          const stmts = child(group, 'blockStatements');
          if (stmts) {
            try {
              for (const blockStmt of children(stmts, 'blockStatement')) {
                this.executeBlockStatement(blockStmt, scope);
              }
            } catch (e) {
              if (e instanceof BreakSignal) return;
              throw e;
            }
          }
          break;
        }
      }
    }
  }

  // ── Expression evaluation ──

  evalExpression(expr: CstNode, scope: Scope): JavaValue {
    // expression > conditionalExpression > ...
    const condExpr = child(expr, 'conditionalExpression');
    if (condExpr) return this.evalConditionalExpression(condExpr, scope);

    // Direct assignment in expression (x = expr)
    // This is handled inside binaryExpression when we see Equals
    return javaNull();
  }

  private evalConditionalExpression(condExpr: CstNode, scope: Scope): JavaValue {
    const binExpr = child(condExpr, 'binaryExpression');
    if (!binExpr) return javaNull();

    const result = this.evalBinaryExpression(binExpr, scope);

    // Ternary operator: condition ? trueExpr : falseExpr
    if (has(condExpr, 'QuestionMark')) {
      const exprs = children(condExpr, 'expression');
      if (exprs.length >= 2) {
        return javaValueToBoolean(result)
          ? this.evalExpression(exprs[0], scope)
          : this.evalExpression(exprs[1], scope);
      }
    }

    return result;
  }

  private evalBinaryExpression(binExpr: CstNode, scope: Scope): JavaValue {
    // binaryExpression contains interleaved unaryExpression and operator tokens
    const allChildren: (CstNode | CstToken)[] = [];
    for (const items of Object.values(binExpr.children)) {
      for (const item of items) allChildren.push(item);
    }

    // Sort by position to get the correct order
    allChildren.sort((a, b) => {
      const aLine = isCstToken(a) ? a.startLine : getLine(a);
      const aCol = isCstToken(a) ? a.startColumn : (getFirstToken(a)?.startColumn || 0);
      const bLine = isCstToken(b) ? b.startLine : getLine(b);
      const bCol = isCstToken(b) ? b.startColumn : (getFirstToken(b)?.startColumn || 0);
      return aLine !== bLine ? aLine - bLine : aCol - bCol;
    });

    const operators: string[] = [];

    for (const item of allChildren) {
      if (isCstToken(item)) {
        const op = item.image;
        // Skip parentheses and other non-operator tokens
        if (['(', ')', '{', '}', '[', ']', ';', ','].includes(op)) continue;
        operators.push(op);
      }
    }

    // Handle assignment operators
    if (operators.length === 1 && isAssignmentOp(operators[0])) {
      return this.evalAssignment(binExpr, operators[0], scope);
    }

    // Build operand THUNKS rather than evaluating eagerly — the operator
    // chain needs to short-circuit && / || without forcing the RHS.
    // Without thunks, `false && side()` would still call side(), violating
    // Java semantics and producing observable side effects.
    //
    // `x instanceof Type` is folded here: the trailing `referenceType` operand
    // is combined with the preceding value into a single boolean operand, and
    // the `instanceof` token is dropped from the operator chain.
    const operandThunks: Array<() => JavaValue> = [];
    const chainOps: string[] = [];
    for (const item of allChildren) {
      if (isCstNode(item) && item.name === 'unaryExpression') {
        const node = item;
        operandThunks.push(() => this.evalUnaryExpression(node, scope));
      } else if (isCstNode(item) && item.name === 'expression') {
        const node = item;
        operandThunks.push(() => this.evalExpression(node, scope));
      } else if (isCstNode(item) && item.name === 'referenceType') {
        const typeName = this.firstIdentifier(item);
        const operand = operandThunks.pop() ?? (() => javaNull());
        operandThunks.push(() => javaBool(this.isInstanceOf(operand(), typeName)));
      } else if (isCstToken(item)) {
        const op = item.image;
        if (['(', ')', '{', '}', '[', ']', ';', ','].includes(op)) continue;
        if (op === 'instanceof') continue; // folded into the referenceType operand
        chainOps.push(op);
      }
    }

    if (operandThunks.length === 0) return javaNull();
    if (chainOps.length === 0) return operandThunks[0]();

    // Evaluate left to right with precedence (short-circuits && / ||)
    return this.evalOperatorChain(operandThunks, chainOps);
  }

  private evalAssignment(binExpr: CstNode, op: string, scope: Scope): JavaValue {
    const unaryExprs = children(binExpr, 'unaryExpression');
    const target = unaryExprs.length > 0 ? bareOperand(unaryExprs[0]) : undefined;
    if (!target) throw new InterpreterError('Invalid assignment target', getLine(binExpr));
    const ref = this.resolveReference(target, scope);

    const evalRhs = (): JavaValue => {
      const rhsExprs = children(binExpr, 'expression');
      if (rhsExprs.length > 0) return this.evalExpression(rhsExprs[0], scope);
      if (unaryExprs.length > 1) return this.evalUnaryExpression(unaryExprs[1], scope);
      throw new InterpreterError('Assignment has no right-hand side', getLine(binExpr));
    };

    if (op === '=') return ref.set(evalRhs());

    // Compound assignment `v op= e` means `v = (T) (v op e)`, where T is v's type.
    // The variable is read before the right-hand side runs (JLS §15.26.2), so
    // `x += (x = 5)` adds the old x.
    const current = ref.get();
    const combined = applyBinaryOp(op.slice(0, -1), current, evalRhs(), this.heap, (v) => this.stringify(v));
    return ref.set(this.narrowToDeclaredType(combined, ref.declaredType));
  }

  /**
   * The variable a primary expression names, for `=`, compound assignment and
   * `++`/`--`. Everything up to the last selector is evaluated with the normal
   * read path; the last selector (or a bare name) becomes the Reference. So
   * `a.b.c = v`, `this.x.y = v`, `arr[i].f = v` and `Main.X = v` all write to
   * exactly the variable written in the source.
   */
  private resolveReference(primary: CstNode, scope: Scope): Reference {
    const chain = this.primaryChain(primary);
    const count = chain.selectors.length;
    if (count === 0) {
      const base = chain.base.step;
      if (base.kind === 'name') return this.nameReference(base.name, scope, chain.base.line);
      const inner = base.kind === 'expression' ? parenthesizedOperand(base.prefix) : undefined;
      if (inner) return this.resolveReference(inner, scope); // (x) = 5
      throw new InterpreterError(`'${chain.base.text}' is not a variable, so it can't be assigned to`, chain.base.line);
    }

    const last = chain.selectors[count - 1];
    const targetText = count === 1 ? chain.base.text : chain.selectors[count - 2].text;
    const target = this.evalChain(chain, count - 1, scope, primary);
    switch (last.step.kind) {
      case 'field':
        return this.memberReference(target, last.step.name, targetText, last.line);
      case 'index': {
        const array = this.chainValue(target, last.line);
        const index = javaValueToNumber(this.evalExpression(last.step.index, scope));
        return arrayElementReference(this.heap, array, index, targetText, last.line);
      }
      case 'unsupported':
        throw new InterpreterError(`${last.step.construct} ${UNSUPPORTED}`, last.line);
      case 'call':
        throw new InterpreterError(`'${last.text}' is not a variable, so it can't be assigned to`, last.line);
    }
  }

  /** A simple name as a variable: a local or parameter, a field of `this`, or a static field. */
  private nameReference(name: string, scope: Scope, line: number): Reference {
    const local = this.lookupLocal(scope, name);
    if (local) return slotReference(local);
    const self = this.getCurrentThis(scope);
    if (self && this.objectHasField(self, name)) {
      return fieldReference(this.heap, self, name, this.fieldDeclaredType(self, name), 'this', line);
    }
    const staticSlot = this.staticFields.variables.get(name);
    if (staticSlot) return slotReference(staticSlot);
    throw new InterpreterError(`Variable '${name}' is not defined`, line);
  }

  /** `target.name` as a variable: an instance field, or a static field reached through its class. */
  private memberReference(target: ChainValue, name: string, targetText: string, line: number): Reference {
    if (target.kind === 'value') {
      if (target.value.kind === 'arrayRef' && name === 'length') {
        throw new InterpreterError("The length of an array can't be assigned to", line);
      }
      return fieldReference(this.heap, target.value, name, this.fieldDeclaredType(target.value, name), targetText, line);
    }
    if (target.kind === 'type') {
      if (this.classNames.has(target.name)) {
        // Static fields share one namespace across classes until per-class statics (#15).
        const slot = this.staticFields.variables.get(name);
        if (slot) return slotReference(slot);
        throw new InterpreterError(`Field '${name}' does not exist on ${target.name}`, line);
      }
      throw new InterpreterError(`${target.name}.${name} can't be assigned to`, line);
    }
    throw new InterpreterError(`Variable '${target.path[0]}' is not defined`, line);
  }

  /** A local variable or parameter, searching block scopes out to the method's scope (statics excluded). */
  private lookupLocal(scope: Scope, name: string): { value: JavaValue; type: JavaType } | undefined {
    for (let s: Scope | null = scope; s && s !== this.staticFields; s = s.parent) {
      const entry = s.variables.get(name);
      if (entry) return entry;
    }
    return undefined;
  }

  private getCurrentThis(scope: Scope): JavaValue | undefined {
    return lookupVariable(scope, 'this')?.value;
  }

  /**
   * The class whose method is currently executing (innermost call-stack frame).
   * Used to resolve unqualified static calls against the enclosing class — e.g.
   * a helper method called from a sibling static method in a non-entry class.
   */
  private currentClassName(): string | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].className) return this.callStack[i].className;
    }
    return undefined;
  }

  private resolveThis(scope: Scope, line: number): JavaValue {
    const thisValue = this.getCurrentThis(scope);
    if (!thisValue) {
      throw new InterpreterError("'this' cannot be used in a static context", line);
    }
    return thisValue;
  }

  private objectHasField(obj: JavaValue, fieldName: string): boolean {
    if (obj.kind !== 'objectRef') return false;
    const objData = this.heap.get(obj.heapId);
    return Boolean(objData && isJavaObject(objData) && objData.fields.has(fieldName));
  }

  /** A user class's declared type for a field ('Object' when unknown, which skips conversion). */
  private fieldDeclaredType(obj: JavaValue, fieldName: string): JavaType {
    if (obj.kind !== 'objectRef') return 'Object';
    return this.instanceFields.get(obj.className)?.find(f => f.name === fieldName)?.type ?? 'Object';
  }

  /**
   * The implicit cast in compound assignment (`v op= e` is `v = (T) (v op e)`,
   * JLS §15.26.2) and in `++`/`--` (JLS §15.14.2): the result goes back to the
   * variable's own type, so `salary *= 1.5` stays an int and `c += 2` stays a char.
   */
  private narrowToDeclaredType(value: JavaValue, type: JavaType): JavaValue {
    if (value.kind !== 'primitive') return value;
    switch (type) {
      case 'int': case 'short': case 'byte': case 'char': case 'boolean': case 'float': case 'double':
        return this.castPrimitiveValue(value, type);
      case 'long':
        // castPrimitiveValue cuts long to 32 bits (#10); keep the magnitude instead.
        return { kind: 'primitive', javaType: 'long', value: Math.trunc(javaValueToNumber(value)) || 0 };
    }
    return value; // String (+=), boxed and reference types
  }

  private evalOperatorChain(operandThunks: Array<() => JavaValue>, operators: string[]): JavaValue {
    // Handle operator precedence by grouping
    // Order: * / % -> + - -> << >> >>> -> < > <= >= -> == != -> & -> ^ -> | -> && -> ||
    const precGroups = [
      ['*', '/', '%'],
      ['+', '-'],
      ['<<', '>>', '>>>'],
      ['<', '>', '<=', '>=', 'instanceof'],
      ['==', '!='],
      ['&'],
      ['^'],
      ['|'],
      ['&&'],
      ['||'],
    ];

    let vals: Array<() => JavaValue> = [...operandThunks];
    let ops = [...operators];
    const heap = this.heap;
    const stringify = (v: JavaValue) => this.stringify(v);

    for (const group of precGroups) {
      const newVals: Array<() => JavaValue> = [vals[0]];
      const newOps: string[] = [];
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (group.includes(op)) {
          const left = newVals.pop()!;
          const right = vals[i + 1];
          if (op === '&&') {
            newVals.push(() => {
              const l = left();
              return javaValueToBoolean(l) ? right() : javaBool(false);
            });
          } else if (op === '||') {
            newVals.push(() => {
              const l = left();
              return javaValueToBoolean(l) ? javaBool(true) : right();
            });
          } else {
            newVals.push(() => applyBinaryOp(op, left(), right(), heap, stringify));
          }
        } else {
          newVals.push(vals[i + 1]);
          newOps.push(op);
        }
      }
      vals = newVals;
      ops = newOps;
    }

    return vals[0]();
  }

  private evalUnaryExpression(unary: CstNode, scope: Scope): JavaValue {
    const primary = child(unary, 'primary');
    if (!primary) return javaNull();

    // Prefix operators are listed in source order: `- ++x` is ['-', '++'].
    const prefixOps = tokens(unary, 'UnaryPrefixOperator').map(t => t.image);
    const postfixOp = token(unary, 'UnarySuffixOperator')?.image;
    let value: JavaValue;
    if (postfixOp === '++' || postfixOp === '--') {
      // Postfix binds tighter than any prefix operator, and yields the old value.
      value = this.incrementVariable(primary, scope, postfixOp === '++' ? 1 : -1, false);
    } else if (prefixOps.length > 0 && (prefixOps[prefixOps.length - 1] === '++' || prefixOps[prefixOps.length - 1] === '--')) {
      value = this.incrementVariable(primary, scope, prefixOps.pop() === '++' ? 1 : -1, true);
    } else {
      value = this.evalPrimary(primary, scope);
    }
    for (let i = prefixOps.length - 1; i >= 0; i--) {
      value = this.applyPrefixOperator(prefixOps[i], value, getLine(unary));
    }
    return value;
  }

  private applyPrefixOperator(op: string, val: JavaValue, line: number): JavaValue {
    switch (op) {
      case '!': return javaBool(!javaValueToBoolean(val));
      case '-': {
        const n = javaValueToNumber(val);
        if (val.kind === 'primitive' && (val.javaType === 'double' || val.javaType === 'float')) {
          return javaDouble(-n);
        }
        return javaInt(-n);
      }
      case '+': return val;
      case '~': return javaInt(~(javaValueToNumber(val) | 0));
      case '++': case '--':
        throw new InterpreterError(`${op} needs a variable to change`, line);
    }
    return val;
  }

  /**
   * `++`/`--` on the variable a primary names (a local, field, static or array
   * element). The result is narrowed back to the variable's type, so `c++` on a
   * char stays a char. Prefix returns the new value, postfix the old one.
   */
  private incrementVariable(primary: CstNode, scope: Scope, delta: number, returnNew: boolean): JavaValue {
    const ref = this.resolveReference(primary, scope);
    const old = ref.get();
    const stored = ref.set(this.narrowToDeclaredType(stepValue(old, delta), ref.declaredType));
    return returnNew ? stored : old;
  }

  // ── Primary expression evaluation ──

  private evalPrimary(primary: CstNode, scope: Scope): JavaValue {
    const chain = this.primaryChain(primary);
    return this.chainValue(this.evalChain(chain, chain.selectors.length, scope, primary), getLine(primary));
  }

  /** A primary that starts with a literal, a parenthesized expression, a cast or `new`. */
  private evalPrimaryPrefix(prefix: CstNode, scope: Scope): JavaValue {
    // Literal
    const literal = child(prefix, 'literal');
    if (literal) return this.evalLiteral(literal);

    // Parenthesized expression
    const parenExpr = child(prefix, 'parenthesisExpression');
    if (parenExpr) {
      const expr = child(parenExpr, 'expression');
      return expr ? this.evalExpression(expr, scope) : javaNull();
    }

    // Cast expression, e.g. (int) values[0]
    const castExpr = child(prefix, 'castExpression');
    if (castExpr) return this.evalCastExpression(castExpr, scope);

    // new expression
    const newExpr = child(prefix, 'newExpression');
    if (newExpr) return this.evalNewExpression(newExpr, scope);

    return javaNull();
  }

  private evalCastExpression(castExpr: CstNode, scope: Scope): JavaValue {
    const primitiveCast = child(castExpr, 'primitiveCastExpression');
    if (primitiveCast) {
      const primitiveType = this.extractPrimitiveType(child(primitiveCast, 'primitiveType'));
      const unaryExpr = child(primitiveCast, 'unaryExpression');
      const value = unaryExpr ? this.evalUnaryExpression(unaryExpr, scope) : javaNull();
      return this.castPrimitiveValue(value, primitiveType);
    }

    // Reference cast, e.g. (P) o — types aren't enforced, so return the operand.
    const refCast = child(castExpr, 'referenceTypeCastExpression');
    if (refCast) {
      const operand = child(refCast, 'unaryExpressionNotPlusMinus');
      return operand ? this.evalUnaryExpressionNotPlusMinus(operand, scope) : javaNull();
    }

    return javaNull();
  }

  /** First Identifier token anywhere under a node (e.g. the class name of a referenceType). */
  private firstIdentifier(node: CstNode): string {
    const direct = token(node, 'Identifier');
    if (direct) return direct.image;
    for (const key of Object.keys(node.children)) {
      for (const c of node.children[key]) {
        if (isCstNode(c)) { const r = this.firstIdentifier(c); if (r) return r; }
      }
    }
    return '';
  }

  /** `value instanceof typeName` — exact class match, exception hierarchy, or Object/String. */
  private isInstanceOf(value: JavaValue, typeName: string): boolean {
    if (value.kind === 'null') return false;
    if (typeName === 'Object') return true;
    if (value.kind === 'objectRef') {
      if (value.className === typeName) return true;
      if (isExceptionClass(value.className) || isExceptionClass(typeName)) {
        return exceptionAssignable(value.className, typeName);
      }
      return false; // user inheritance isn't tracked
    }
    if (value.kind === 'string') return typeName === 'String' || typeName === 'CharSequence';
    return false; // primitives / arrays
  }

  private evalUnaryExpressionNotPlusMinus(node: CstNode, scope: Scope): JavaValue {
    const primary = child(node, 'primary');
    if (primary) return this.evalPrimary(primary, scope);
    const cast = child(node, 'castExpression');
    if (cast) return this.evalCastExpression(cast, scope);
    const unary = child(node, 'unaryExpression');
    if (unary) {
      const val = this.evalUnaryExpression(unary, scope);
      if (has(node, 'Bang')) return javaBool(!javaValueToBoolean(val));
      if (has(node, 'Tilde')) return javaInt(~(javaValueToNumber(val) | 0));
      return val;
    }
    return javaNull();
  }

  private castPrimitiveValue(value: JavaValue, targetType: JavaType): JavaValue {
    if (targetType === 'boolean') return javaBool(javaValueToBoolean(value));
    const n = javaValueToNumber(value);
    switch (targetType) {
      case 'double':
      case 'float':
        return { kind: 'primitive', javaType: targetType, value: n };
      case 'char':
        return javaChar(n | 0);
      case 'long':
      case 'byte':
      case 'short':
        return { kind: 'primitive', javaType: targetType, value: n | 0 };
      case 'int':
      default:
        return javaInt(n);
    }
  }

  private evalLiteral(literal: CstNode): JavaValue {
    // Integer literal
    const intLit = child(literal, 'integerLiteral');
    if (intLit) {
      const tok = token(intLit, 'DecimalLiteral') || token(intLit, 'HexLiteral') || token(intLit, 'OctalLiteral') || token(intLit, 'BinaryLiteral');
      if (tok) {
        let img = tok.image.replace(/_/g, '');
        if (img.endsWith('L') || img.endsWith('l')) img = img.slice(0, -1);
        return javaInt(parseInt(img, 10));
      }
    }

    // Floating point literal
    const fpLit = child(literal, 'floatingPointLiteral');
    if (fpLit) {
      const tok = token(fpLit, 'FloatLiteral') || token(fpLit, 'DoubleLiteral');
      if (tok) {
        let img = tok.image.replace(/_/g, '');
        if (img.endsWith('f') || img.endsWith('F') || img.endsWith('d') || img.endsWith('D')) {
          img = img.slice(0, -1);
        }
        return javaDouble(parseFloat(img));
      }
    }

    // Boolean literal
    const boolLit = child(literal, 'booleanLiteral');
    if (boolLit) {
      return javaBool(has(boolLit, 'True'));
    }

    // String literal
    const strTok = token(literal, 'StringLiteral');
    if (strTok) {
      // Remove surrounding quotes and unescape
      let s = strTok.image.slice(1, -1);
      s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
        .replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\'/g, "'");
      return javaString(s);
    }

    // Char literal
    const charTok = token(literal, 'CharLiteral');
    if (charTok) {
      let s = charTok.image.slice(1, -1);
      s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
        .replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      return javaChar(s.charCodeAt(0));
    }

    // Null literal
    if (has(literal, 'Null')) return javaNull();

    return javaNull();
  }

  // ── Names, selectors and method calls ──
  //
  // A primary expression is a base followed by selectors, evaluated left to
  // right: `people[1].age`, `head.next.getVal()`, `this.data[this.size]`,
  // `Main.total`, `java.util.Arrays.toString(a)`. Reads, method calls and
  // writes (resolveReference) all walk the same chain, so every shape resolves
  // the same way.

  /** The base and selectors of a primary, cached per CST node (the tree never changes). */
  private primaryChain(primary: CstNode): PrimaryChain {
    let chain = this.chainCache.get(primary);
    if (!chain) {
      chain = buildPrimaryChain(primary);
      this.chainCache.set(primary, chain);
    }
    return chain;
  }

  /** Evaluate a chain's base and its first `count` selectors. */
  private evalChain(chain: PrimaryChain, count: number, scope: Scope, primary: CstNode): ChainValue {
    let current = this.evalChainBase(chain.base, scope, primary);
    for (let i = 0; i < count; i++) {
      const receiverText = i === 0 ? chain.base.text : chain.selectors[i - 1].text;
      current = this.applySelector(current, chain.selectors[i], receiverText, scope, primary);
    }
    return current;
  }

  private evalChainBase(base: ChainStep<ChainBase>, scope: Scope, primary: CstNode): ChainValue {
    const step = base.step;
    switch (step.kind) {
      case 'name':
        return this.resolveSimpleName(step.name, scope);
      case 'this':
        return { kind: 'value', value: this.resolveThis(scope, base.line) };
      case 'super':
        throw new InterpreterError(`'super.' member access ${UNSUPPORTED}`, base.line);
      case 'call': {
        const args = this.evalArguments(step.args, scope);
        return { kind: 'value', value: this.invokeUnqualified(step.name, args, scope, primary, base.line) };
      }
      case 'expression':
        return { kind: 'value', value: this.evalPrimaryPrefix(step.prefix, scope) };
    }
  }

  /**
   * What a simple name refers to, in Java's order: a local variable or
   * parameter, a field of `this`, a static field, then a class. Anything else
   * stays unresolved (a package prefix like `java.util`, or an undefined name)
   * and is reported only if it is used as a value.
   */
  private resolveSimpleName(name: string, scope: Scope): ChainValue {
    const local = this.lookupLocal(scope, name);
    if (local) return { kind: 'value', value: local.value };
    const self = this.getCurrentThis(scope);
    if (self && this.objectHasField(self, name)) {
      return { kind: 'value', value: fieldReference(this.heap, self, name, 'Object', 'this', 0).get() };
    }
    const staticSlot = this.staticFields.variables.get(name);
    if (staticSlot) return { kind: 'value', value: staticSlot.value };
    if (this.isKnownClass(name)) return { kind: 'type', name };
    return { kind: 'unresolved', path: [name] };
  }

  private isKnownClass(name: string): boolean {
    return this.classNames.has(name) || LIBRARY_CLASSES.has(name);
  }

  private applySelector(
    current: ChainValue,
    selector: ChainStep<Selector>,
    receiverText: string,
    scope: Scope,
    primary: CstNode,
  ): ChainValue {
    const { step, line } = selector;
    switch (step.kind) {
      case 'field':
        return this.selectField(current, step.name, receiverText, line);
      case 'call': {
        // The receiver is evaluated first, then the arguments (JLS §15.12.4).
        const args = this.evalArguments(step.args, scope);
        return { kind: 'value', value: this.invokeOn(current, step.name, args, receiverText, primary, line) };
      }
      case 'index': {
        const array = this.chainValue(current, line);
        const index = javaValueToNumber(this.evalExpression(step.index, scope));
        return { kind: 'value', value: arrayElementReference(this.heap, array, index, receiverText, line).get() };
      }
      case 'unsupported':
        throw new InterpreterError(`${step.construct} ${UNSUPPORTED}`, line);
    }
  }

  /** `current.name`: a field, an array's length, a class's static member, or the next part of a package name. */
  private selectField(current: ChainValue, name: string, receiverText: string, line: number): ChainValue {
    if (current.kind === 'value') {
      const target = current.value;
      if (target.kind === 'arrayRef' || (target.kind === 'null' && name === 'length')) {
        if (name !== 'length') throw new InterpreterError(`Arrays have no field '${name}', only length`, line);
        return { kind: 'value', value: javaInt(arrayLength(this.heap, target, receiverText, line)) };
      }
      return { kind: 'value', value: fieldReference(this.heap, target, name, 'Object', receiverText, line).get() };
    }
    if (current.kind === 'type') return this.staticMember(current.name, name, line);
    // An unresolved name followed by a class name was a package: java.util.Arrays
    if (this.isKnownClass(name)) return { kind: 'type', name };
    return { kind: 'unresolved', path: [...current.path, name] };
  }

  /** `ClassName.name`: a static field, a nested class, or a library constant such as Math.PI or System.out. */
  private staticMember(className: string, name: string, line: number): ChainValue {
    if (this.classNames.has(className)) {
      // Static fields share one namespace across classes until per-class statics (#15).
      const slot = this.staticFields.variables.get(name);
      if (slot) return { kind: 'value', value: slot.value };
      if (this.classNames.has(name)) return { kind: 'type', name };
      if (this.instanceFields.get(className)?.some(f => f.name === name)) {
        throw new InterpreterError(`'${name}' is an instance field of ${className}, so it needs an object`, line);
      }
      throw new InterpreterError(`Field '${name}' does not exist on ${className}`, line);
    }
    if (className === 'System') {
      if (name === 'out') return { kind: 'value', value: SYSTEM_OUT };
      if (name === 'err') return { kind: 'value', value: SYSTEM_ERR };
      if (name === 'in') return { kind: 'value', value: SYSTEM_IN };
    }
    const constant = getStaticField(className, name);
    if (constant) return { kind: 'value', value: constant };
    if (this.isKnownClass(name)) return { kind: 'type', name };
    throw new InterpreterError(`Unknown field: ${className}.${name}`, line);
  }

  /** The value a chain evaluated to. A class, or a name that resolved to nothing, isn't a value. */
  private chainValue(current: ChainValue, line: number): JavaValue {
    if (current.kind === 'value') return current.value;
    const name = current.kind === 'type' ? current.name : current.path[0];
    throw new InterpreterError(`Variable '${name}' is not defined`, line);
  }

  private invokeOn(
    current: ChainValue,
    name: string,
    args: JavaValue[],
    receiverText: string,
    primary: CstNode,
    line: number,
  ): JavaValue {
    if (current.kind === 'value') return this.invokeMethod(current.value, name, args, receiverText, primary, line);
    const className = current.kind === 'type' ? current.name : current.path[current.path.length - 1];
    return this.invokeStatic(className, name, args, receiverText, primary, line);
  }

  /** An instance method call on a value: String, StringBuilder, library objects, or a user class. */
  private invokeMethod(
    target: JavaValue,
    name: string,
    args: JavaValue[],
    receiverText: string,
    primary: CstNode,
    line: number,
  ): JavaValue {
    if (target.kind === 'null') {
      throw nullPointer(`Cannot invoke "${name}()" because "${receiverText}" is null`, line);
    }
    if (target.kind === 'string') return this.evalStringMethod(target.value, name, args);
    if (target.kind === 'arrayRef' && name === 'toString') return javaString(javaValueToString(target, this.heap));
    if (target.kind === 'objectRef') {
      if (target.heapId === SYSTEM_OUT_ID || target.heapId === SYSTEM_ERR_ID) {
        return this.printStreamMethod(name, args, receiverText, line);
      }
      if (target.className === 'StringBuilder' || target.className === 'StringBuffer') {
        return this.evalStringBuilderMethod(target, name, args);
      }
      if (!this.classNames.has(target.className) && target.heapId !== SYSTEM_IN_ID) {
        const builtin = callInstanceMethod(target, name, args, this.ctx);
        if (builtin !== undefined) return builtin;
      }
      const method = this.resolveMethod(this.methodsByClass.get(target.className), name, args.length);
      if (method) return this.callMethod(method, args, getLine(primary), method.isStatic ? undefined : target);
      const excResult = this.exceptionFallback(target, name);
      if (excResult !== undefined) return excResult;
    }
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  /** `ClassName.name(args)` on a user class or a library class (Math, Arrays, Integer, …). */
  private invokeStatic(
    className: string,
    name: string,
    args: JavaValue[],
    receiverText: string,
    primary: CstNode,
    line: number,
  ): JavaValue {
    // A user class takes precedence over a library class with the same name.
    if (this.classNames.has(className)) {
      const method = this.resolveMethod(this.methodsByClass.get(className), name, args.length);
      if (method?.isStatic) return this.callMethod(method, args, getLine(primary));
      if (method) throw new InterpreterError(`Cannot call instance method '${name}' without an object`, line);
    }
    const result = callStaticMethod(className, name, args, this.ctx);
    if (result !== undefined) return result;
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  /**
   * An unqualified call `name(args)`: a static method of the enclosing class
   * (so a helper in a non-entry class finds its own siblings), then of the
   * entry class, then an instance method on `this`.
   */
  private invokeUnqualified(name: string, args: JavaValue[], scope: Scope, primary: CstNode, line: number): JavaValue {
    const currentClass = this.currentClassName();
    const method =
      (currentClass ? this.resolveMethod(this.methodsByClass.get(currentClass), name, args.length) : undefined)
      || this.resolveMethod(this.methods, name, args.length);
    if (method && method.isStatic) return this.callMethod(method, args, getLine(primary));

    // An instance method called unqualified from an instance context, e.g. one
    // instance method invoking a sibling. Dispatch on `this`.
    const self = this.getCurrentThis(scope);
    if (self?.kind === 'objectRef') {
      const instanceMethod = this.resolveMethod(this.methodsByClass.get(self.className), name, args.length);
      if (instanceMethod && !instanceMethod.isStatic) {
        return this.callMethod(instanceMethod, args, getLine(primary), self);
      }
    }

    // Found the method, but it's an instance method and there's no `this`
    // (a genuine static context): surface the classic Java error.
    if (method) throw new InterpreterError(`Cannot call instance method '${name}' without an object`, getLine(primary));
    throw new InterpreterError(`Unknown method: ${name}()`, line);
  }

  /** System.out and System.err. Both write to the one console for now (stderr is #22). */
  private printStreamMethod(name: string, args: JavaValue[], receiverText: string, line: number): JavaValue {
    switch (name) {
      case 'println':
        this.appendStdout((args.length > 0 ? this.stringify(args[0]) : '') + '\n');
        return javaNull();
      case 'print':
        this.appendStdout(args.length > 0 ? this.stringify(args[0]) : '');
        return javaNull();
      case 'printf':
      case 'format': {
        const fmt = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
        this.appendStdout(javaFormat(fmt, args.slice(1), this.heap));
        return javaNull();
      }
      case 'flush':
        return javaNull();
    }
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  private evalArguments(args: CstNode[], scope: Scope): JavaValue[] {
    return args.map(arg => this.evalExpression(arg, scope));
  }

  /**
   * Fallback for Throwable methods (getMessage/getLocalizedMessage/toString/
   * printStackTrace) on a user-defined exception object that doesn't define
   * them itself. Returns undefined for unrelated methods.
   */
  private exceptionFallback(target: JavaValue, methodName: string): JavaValue | undefined {
    if (methodName === 'getMessage' || methodName === 'getLocalizedMessage'
      || methodName === 'printStackTrace'
      || (methodName === 'toString' && target.kind === 'objectRef'
          && /(?:Exception|Error)$/.test(target.className))) {
      return exceptionMethod(target, methodName, this.ctx);
    }
    return undefined;
  }

  private callMethod(
    method: MethodDef,
    args: JavaValue[],
    callSiteLine?: number,
    thisValue?: JavaValue,
  ): JavaValue {
    const methodScope = createScope(this.staticFields);
    if (thisValue) {
      setVariable(methodScope, 'this', thisValue, thisValue.kind === 'objectRef' ? thisValue.className : 'Object');
    }

    // Bind parameters
    for (let i = 0; i < method.params.length; i++) {
      const param = method.params[i];
      const arg = i < args.length ? args[i] : defaultValue(param.type);
      setVariable(methodScope, param.name, arg, param.type);
    }

    // Pre-call snapshot: show the call site line before entering the method
    if (callSiteLine) {
      this.emitSnapshot(callSiteLine);
    }

    this.callStack.push({ name: method.name, scope: methodScope, currentScope: methodScope, className: method.className });
    try {
      this.executeBlock(method.body, methodScope);
      return javaNull();
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e; // propagate JavaThrow / signals; frame popped in finally
    } finally {
      this.callStack.pop();
    }
  }

  private findConstructor(className: string, args: JavaValue[]): ConstructorDef | undefined {
    return (this.constructors.get(className) || []).find(ctor => ctor.params.length === args.length);
  }

  private callConstructor(
    ctor: ConstructorDef,
    thisValue: JavaValue,
    args: JavaValue[],
    callSiteLine: number,
  ): void {
    const ctorScope = createScope(this.staticFields);
    setVariable(ctorScope, 'this', thisValue, ctor.className);

    for (let i = 0; i < ctor.params.length; i++) {
      const param = ctor.params[i];
      const arg = i < args.length ? args[i] : defaultValue(param.type);
      setVariable(ctorScope, param.name, arg, param.type);
    }

    // super("message") / this("message"): capture a detail message on the object
    // so user-defined exceptions calling super(msg) still answer getMessage().
    const eci = child(ctor.body, 'explicitConstructorInvocation');
    const unqualified = eci ? child(eci, 'unqualifiedExplicitConstructorInvocation') : undefined;
    if (unqualified && thisValue.kind === 'objectRef') {
      const argList = child(unqualified, 'argumentList');
      const first = argList ? children(argList, 'expression')[0] : undefined;
      if (first) {
        const val = this.evalExpression(first, ctorScope);
        if (val.kind === 'string') {
          const obj = this.heap.get(thisValue.heapId);
          if (obj && isJavaObject(obj) && !obj.fields.has('message')) obj.fields.set('message', val);
        }
      }
    }

    this.emitSnapshot(callSiteLine);
    this.callStack.push({ name: ctor.className, scope: ctorScope, currentScope: ctorScope, className: ctor.className });
    try {
      this.executeBlock(ctor.body, ctorScope);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) {
        throw e;
      }
    } finally {
      this.callStack.pop();
    }
  }

  // ── new expression ──

  private evalNewExpression(newExpr: CstNode, scope: Scope): JavaValue {
    // Array creation: new int[5], new int[]{1, 2, 3}
    const arrayCreation = child(newExpr, 'arrayCreationExpression');
    if (arrayCreation) {
      return this.evalArrayCreation(arrayCreation, scope);
    }

    // Object creation: new ClassName(args)
    const unqualified = child(newExpr, 'unqualifiedClassInstanceCreationExpression');
    if (unqualified) {
      return this.evalObjectCreation(unqualified, scope);
    }

    return javaNull();
  }

  private evalArrayCreation(arrayCreation: CstNode, scope: Scope): JavaValue {
    // Determine element type
    let elementType = 'int';
    const primType = child(arrayCreation, 'primitiveType');
    if (primType) {
      elementType = this.extractPrimitiveType(primType);
    }
    const classType = child(arrayCreation, 'classOrInterfaceType');
    if (classType) {
      const classOrType = child(classType, 'classType');
      if (classOrType) {
        const id = token(classOrType, 'Identifier');
        if (id) elementType = id.image;
      }
    }

    // With initializer: new int[]{1, 2, 3}
    const withInit = child(arrayCreation, 'arrayCreationWithInitializerSuffix');
    if (withInit) {
      const arrayInit = child(withInit, 'arrayInitializer');
      if (arrayInit) {
        return this.evalArrayInitializer(arrayInit, elementType + '[]', scope);
      }
    }

    // Without initializer: new int[5]
    const withoutInit = child(arrayCreation, 'arrayCreationExpressionWithoutInitializerSuffix');
    if (withoutInit) {
      const dimExprs = child(withoutInit, 'dimExprs');
      if (dimExprs) {
        const dims = children(dimExprs, 'dimExpr');
        if (dims.length > 0) {
          const sizeExpr = child(dims[0], 'expression')!;
          const size = javaValueToNumber(this.evalExpression(sizeExpr, scope));

          if (dims.length > 1) {
            // Multi-dimensional array
            const innerSize = child(dims[1], 'expression');
            const elements: JavaValue[] = [];
            for (let i = 0; i < size; i++) {
              if (innerSize) {
                const innerLen = javaValueToNumber(this.evalExpression(innerSize, scope));
                const innerElements = Array(innerLen).fill(null).map(() => defaultValue(elementType));
                const innerHeapId = this.allocArray(elementType, innerElements);
                elements.push({ kind: 'arrayRef', heapId: innerHeapId });
              } else {
                elements.push(javaNull());
              }
            }
            const heapId = this.allocArray(elementType + '[]', elements);
            return { kind: 'arrayRef', heapId };
          }

          const elements = Array(size).fill(null).map(() => defaultValue(elementType));
          const heapId = this.allocArray(elementType, elements);
          return { kind: 'arrayRef', heapId };
        }
      }
    }

    return javaNull();
  }

  private evalObjectCreation(creation: CstNode, scope: Scope): JavaValue {
    // Get class name
    const classType = child(creation, 'classOrInterfaceTypeToInstantiate');
    if (!classType) return javaNull();
    const id = token(classType, 'Identifier');
    const className = id?.image || 'Object';

    // Get constructor arguments
    const args: JavaValue[] = [];
    const argList = child(creation, 'argumentList');
    if (argList) {
      for (const argExpr of children(argList, 'expression')) {
        args.push(this.evalExpression(argExpr, scope));
      }
    }

    // Built-in types
    if (className === 'StringBuilder' || className === 'StringBuffer') {
      const initial = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
      const heapId = this.allocObject(className, new Map([
        ['value', javaString(initial)],
      ]));
      return { kind: 'objectRef', heapId, className };
    }

    // Collections, Scanner, Random — handled by the stdlib, unless the user
    // defined their own class with the same name (which takes precedence).
    if (!this.classNames.has(className)) {
      const builtin = newBuiltin(className, args, this.ctx);
      if (builtin) return builtin;
    }

    // Generic object — create with declared instance fields, then run a matching constructor.
    const heapId = this.allocObject(className, this.createInstanceFields(className, scope));
    const objectRef: JavaValue = { kind: 'objectRef', heapId, className };
    const ctor = this.findConstructor(className, args);
    if (ctor) {
      this.callConstructor(ctor, objectRef, args, getLine(creation));
    }
    return objectRef;
  }

  // ── Built-in methods ──

  private evalStringMethod(str: string, method: string, args: JavaValue[]): JavaValue {
    switch (method) {
      case 'length': return javaInt(str.length);
      case 'charAt': return javaChar(str.charCodeAt(javaValueToNumber(args[0]) | 0));
      case 'substring': {
        const start = javaValueToNumber(args[0]) | 0;
        const end = args.length > 1 ? javaValueToNumber(args[1]) | 0 : str.length;
        return javaString(str.substring(start, end));
      }
      case 'indexOf': {
        const search = javaValueToString(args[0], this.heap);
        const from = args.length > 1 ? javaValueToNumber(args[1]) | 0 : 0;
        return javaInt(str.indexOf(search, from));
      }
      case 'lastIndexOf': {
        const search = javaValueToString(args[0], this.heap);
        return javaInt(str.lastIndexOf(search));
      }
      case 'toUpperCase': return javaString(str.toUpperCase());
      case 'toLowerCase': return javaString(str.toLowerCase());
      case 'trim': return javaString(str.trim());
      case 'contains': return javaBool(str.includes(javaValueToString(args[0], this.heap)));
      case 'startsWith': return javaBool(str.startsWith(javaValueToString(args[0], this.heap)));
      case 'endsWith': return javaBool(str.endsWith(javaValueToString(args[0], this.heap)));
      case 'equals': return javaBool(str === javaValueToString(args[0], this.heap));
      case 'equalsIgnoreCase': return javaBool(str.toLowerCase() === javaValueToString(args[0], this.heap).toLowerCase());
      case 'isEmpty': return javaBool(str.length === 0);
      case 'replace': {
        const target = javaValueToString(args[0], this.heap);
        const replacement = javaValueToString(args[1], this.heap);
        return javaString(str.split(target).join(replacement));
      }
      case 'split': {
        const delimiter = javaValueToString(args[0], this.heap);
        const parts = str.split(delimiter);
        const elements = parts.map(p => javaString(p));
        const heapId = this.allocArray('String', elements);
        return { kind: 'arrayRef', heapId };
      }
      case 'toCharArray': {
        const chars = Array.from(str).map(c => javaChar(c.charCodeAt(0)));
        const heapId = this.allocArray('char', chars);
        return { kind: 'arrayRef', heapId };
      }
      case 'compareTo': return javaInt(str < javaValueToString(args[0], this.heap) ? -1 : str > javaValueToString(args[0], this.heap) ? 1 : 0);
      case 'compareToIgnoreCase': {
        const o = javaValueToString(args[0], this.heap).toLowerCase();
        const s = str.toLowerCase();
        return javaInt(s < o ? -1 : s > o ? 1 : 0);
      }
      case 'concat': return javaString(str + javaValueToString(args[0], this.heap));
      case 'repeat': return javaString(str.repeat(Math.max(0, javaValueToNumber(args[0]) | 0)));
      case 'isBlank': return javaBool(str.trim().length === 0);
      case 'strip': return javaString(str.replace(/^\s+|\s+$/g, ''));
      case 'stripLeading': return javaString(str.replace(/^\s+/, ''));
      case 'stripTrailing': return javaString(str.replace(/\s+$/, ''));
      case 'matches': return javaBool(new RegExp('^(?:' + javaValueToString(args[0], this.heap) + ')$').test(str));
      case 'replaceAll':
        return javaString(str.replace(new RegExp(javaValueToString(args[0], this.heap), 'g'), javaValueToString(args[1], this.heap)));
      case 'replaceFirst':
        return javaString(str.replace(new RegExp(javaValueToString(args[0], this.heap)), javaValueToString(args[1], this.heap)));
      default:
        throw new InterpreterError(`Unknown String method: ${method}()`, 0);
    }
  }

  private evalStringBuilderMethod(ref: JavaValue, method: string, args: JavaValue[]): JavaValue {
    if (ref.kind !== 'objectRef') return javaNull();
    const obj = this.heap.get(ref.heapId);
    if (!obj || !isJavaObject(obj)) return javaNull();
    const cur = obj.fields.get('value');
    const curStr = cur && cur.kind === 'string' ? cur.value : '';
    switch (method) {
      case 'append': {
        const next = curStr + (args.length > 0 ? javaValueToString(args[0], this.heap) : '');
        obj.fields.set('value', javaString(next));
        return ref; // append returns the builder for chaining
      }
      case 'toString': return javaString(curStr);
      case 'length': return javaInt(curStr.length);
      case 'charAt': return javaChar(curStr.charCodeAt(javaValueToNumber(args[0]) | 0));
      case 'reverse': {
        obj.fields.set('value', javaString([...curStr].reverse().join('')));
        return ref;
      }
      case 'setLength': {
        const n = javaValueToNumber(args[0]) | 0;
        const next = n <= curStr.length ? curStr.slice(0, n) : curStr + '\0'.repeat(n - curStr.length);
        obj.fields.set('value', javaString(next));
        return javaNull();
      }
      case 'deleteCharAt': {
        const idx = javaValueToNumber(args[0]) | 0;
        obj.fields.set('value', javaString(curStr.slice(0, idx) + curStr.slice(idx + 1)));
        return ref;
      }
      case 'insert': {
        const idx = javaValueToNumber(args[0]) | 0;
        const ins = javaValueToString(args[1], this.heap);
        obj.fields.set('value', javaString(curStr.slice(0, idx) + ins + curStr.slice(idx)));
        return ref;
      }
    }
    throw new InterpreterError(`Unknown StringBuilder method: ${method}()`, 0);
  }
}

// ── Helpers ──

function isAssignmentOp(op: string): boolean {
  return ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='].includes(op);
}

// ── Primary chains ──
//
// A primary expression such as `people[1].age`, `head.next.getVal()` or
// `Main.total` is a base followed by selectors. buildPrimaryChain derives that
// structure from the parser's tree once per node, and the interpreter walks it
// for reads, method calls and writes alike.

/** The start of a primary expression. */
type ChainBase =
  | { kind: 'name'; name: string }                  // a simple name: variable, field, class or package
  | { kind: 'this' }
  | { kind: 'super' }
  | { kind: 'call'; name: string; args: CstNode[] }  // an unqualified method call: foo(1)
  | { kind: 'expression'; prefix: CstNode };         // a literal, (parenthesized), cast or new

/** One step after the base. */
type Selector =
  | { kind: 'field'; name: string }                  // .name
  | { kind: 'call'; name: string; args: CstNode[] }  // .name(args)
  | { kind: 'index'; index: CstNode }                // [index]
  | { kind: 'unsupported'; construct: string };      // .this, .class, ::, outer.new Inner()

interface ChainStep<T> {
  step: T;
  /** Source text of the chain through this step: names the null value in NullPointerExceptions. */
  text: string;
  line: number;
}

interface PrimaryChain {
  base: ChainStep<ChainBase>;
  selectors: ChainStep<Selector>[];
}

/** Where a chain stands while it is evaluated. */
type ChainValue =
  | { kind: 'value'; value: JavaValue }
  | { kind: 'type'; name: string }          // a user or library class: Main, Math, System
  | { kind: 'unresolved'; path: string[] }; // no variable, field or class: a package prefix, or undefined

const UNSUPPORTED = "isn't supported in JavaTutor yet";

/** Library classes that can start a qualified name (for their static members), besides user classes. */
const LIBRARY_CLASSES = new Set([
  'Math', 'System', 'String', 'Objects', 'Arrays', 'Collections', 'List', 'Set', 'Map',
  'Integer', 'Long', 'Short', 'Byte', 'Double', 'Float', 'Boolean', 'Character',
]);

/** System.out, System.err and System.in, which aren't heap objects. */
const SYSTEM_OUT_ID = '__system_out__';
const SYSTEM_ERR_ID = '__system_err__';
const SYSTEM_IN_ID = '__system_in__';
const SYSTEM_OUT: JavaValue = { kind: 'objectRef', heapId: SYSTEM_OUT_ID, className: 'PrintStream' };
const SYSTEM_ERR: JavaValue = { kind: 'objectRef', heapId: SYSTEM_ERR_ID, className: 'PrintStream' };
const SYSTEM_IN: JavaValue = { kind: 'objectRef', heapId: SYSTEM_IN_ID, className: 'InputStream' };

function buildPrimaryChain(primary: CstNode): PrimaryChain {
  const prefix = child(primary, 'primaryPrefix')!;
  const suffixes = children(primary, 'primarySuffix');
  const selectors: ChainStep<Selector>[] = [];
  let base: ChainStep<ChainBase>;
  let nextSuffix = 0;

  const fqn = child(prefix, 'fqnOrRefType');
  if (fqn) {
    // `a.b.c(x)` arrives as the dotted name a.b.c followed by a call suffix, so
    // the name's last part is the method name.
    const parts = fqnParts(fqn);
    const callArgs = suffixes.length > 0 ? callArguments(suffixes[0]) : undefined;
    const methodPart = callArgs ? parts.length - 1 : -1;
    if (callArgs) nextSuffix = 1;
    const first = parts[0];
    base = methodPart === 0
      ? { step: { kind: 'call', name: first.name, args: callArgs! }, text: `${first.name}(${argumentsText(callArgs!)})`, line: first.line }
      : { step: first.isSuper ? { kind: 'super' } : { kind: 'name', name: first.name }, text: first.name, line: first.line };
    let text = base.text;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (i === methodPart) {
        text = `${text}.${part.name}(${argumentsText(callArgs!)})`;
        selectors.push({ step: { kind: 'call', name: part.name, args: callArgs! }, text, line: part.line });
      } else {
        text = `${text}.${part.name}`;
        selectors.push({ step: { kind: 'field', name: part.name }, text, line: part.line });
      }
    }
  } else if (has(prefix, 'This')) {
    base = { step: { kind: 'this' }, text: 'this', line: getLine(prefix) };
  } else if (has(prefix, 'Super')) {
    base = { step: { kind: 'super' }, text: 'super', line: getLine(prefix) };
  } else {
    base = { step: { kind: 'expression', prefix }, text: sourceText(prefix), line: getLine(prefix) };
  }

  let text = selectors.length > 0 ? selectors[selectors.length - 1].text : base.text;
  for (let i = nextSuffix; i < suffixes.length; i++) {
    const suffix = suffixes[i];
    const line = getLine(suffix);
    const arrayAccess = child(suffix, 'arrayAccessSuffix');
    if (arrayAccess) {
      const index = child(arrayAccess, 'expression')!;
      text = `${text}[${sourceText(index)}]`;
      selectors.push({ step: { kind: 'index', index }, text, line });
      continue;
    }
    const name = memberName(suffix);
    if (name) {
      const callArgs = i + 1 < suffixes.length ? callArguments(suffixes[i + 1]) : undefined;
      if (callArgs) {
        text = `${text}.${name}(${argumentsText(callArgs)})`;
        selectors.push({ step: { kind: 'call', name, args: callArgs }, text, line });
        i++;
      } else {
        text = `${text}.${name}`;
        selectors.push({ step: { kind: 'field', name }, text, line });
      }
      continue;
    }
    selectors.push({ step: { kind: 'unsupported', construct: describeSuffix(suffix) }, text, line });
  }
  return { base, selectors };
}

/** The parts of a dotted name. Type arguments (`Collections.<T>emptyList`) are erased. */
function fqnParts(fqn: CstNode): { name: string; isSuper: boolean; line: number }[] {
  const nodes = [child(fqn, 'fqnOrRefTypePartFirst'), ...children(fqn, 'fqnOrRefTypePartRest')];
  const parts: { name: string; isSuper: boolean; line: number }[] = [];
  for (const node of nodes) {
    if (!node) continue;
    const common = child(node, 'fqnOrRefTypePartCommon');
    const id = common ? token(common, 'Identifier') : undefined;
    const sup = common ? token(common, 'Super') : undefined;
    const tok = id ?? sup;
    parts.push({ name: tok?.image ?? '', isSuper: !id && !!sup, line: tok?.startLine ?? getLine(node) });
  }
  return parts;
}

/** The argument expressions of a call suffix, or undefined if the suffix isn't a call. */
function callArguments(suffix: CstNode): CstNode[] | undefined {
  const call = child(suffix, 'methodInvocationSuffix');
  if (!call) return undefined;
  const list = child(call, 'argumentList');
  return list ? children(list, 'expression') : [];
}

/** The member name of a `.name` (or `.<T>name`) suffix. */
function memberName(suffix: CstNode): string | undefined {
  const id = token(suffix, 'Identifier');
  if (!id) return undefined;
  const plain = Object.keys(suffix.children).every(k => k === 'Dot' || k === 'Identifier' || k === 'typeArguments');
  return plain ? id.image : undefined;
}

function describeSuffix(suffix: CstNode): string {
  if (has(suffix, 'This')) return 'Qualified this (Outer.this)';
  if (child(suffix, 'classLiteralSuffix')) return 'Class literals (.class)';
  if (child(suffix, 'methodReferenceSuffix')) return 'Method references (::)';
  if (child(suffix, 'unqualifiedClassInstanceCreationExpression')) return 'Creating an inner class through an object (outer.new Inner())';
  return 'This kind of expression';
}

function argumentsText(args: CstNode[]): string {
  return args.map(sourceText).join(', ');
}

/** The source text of a node, rebuilt from its tokens (spacing approximated from columns). */
function sourceText(node: CstNode): string {
  const toks: CstToken[] = [];
  const collect = (n: CstNode) => {
    for (const items of Object.values(n.children)) {
      for (const item of items) {
        if (isCstToken(item)) toks.push(item);
        else collect(item);
      }
    }
  };
  collect(node);
  toks.sort((a, b) => a.startLine - b.startLine || a.startColumn - b.startColumn);
  let text = '';
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    if (prev && (t.startLine !== prev.endLine || t.startColumn > prev.endColumn + 1)) text += ' ';
    text += t.image;
  });
  return text;
}

/** The primary of a unary expression with no operators, e.g. the left side of an assignment. */
function bareOperand(unary: CstNode): CstNode | undefined {
  if (has(unary, 'UnaryPrefixOperator') || has(unary, 'UnarySuffixOperator')) return undefined;
  return child(unary, 'primary');
}

/** For a parenthesized variable like `(x)`, the primary inside it; undefined for anything else. */
function parenthesizedOperand(prefix: CstNode): CstNode | undefined {
  const paren = child(prefix, 'parenthesisExpression');
  const expr = paren ? child(paren, 'expression') : undefined;
  const cond = expr ? child(expr, 'conditionalExpression') : undefined;
  if (!cond || has(cond, 'QuestionMark')) return undefined;
  const bin = child(cond, 'binaryExpression');
  const operands = bin ? children(bin, 'unaryExpression') : [];
  if (!bin || operands.length !== 1 || Object.keys(bin.children).length !== 1) return undefined;
  return bareOperand(operands[0]);
}

function applyBinaryOp(
  op: string,
  left: JavaValue,
  right: JavaValue,
  heap: Map<string, JavaHeapEntry>,
  stringify?: (v: JavaValue) => string,
): JavaValue {
  // String concatenation: if either side is a string, Java converts the other
  // to its string form (honoring a user toString() via the stringify callback).
  if (op === '+' && (left.kind === 'string' || right.kind === 'string')) {
    const str = stringify ?? ((v: JavaValue) => javaValueToString(v, heap));
    return javaString(str(left) + str(right));
  }

  const l = javaValueToNumber(left);
  const r = javaValueToNumber(right);

  // Determine if result should be double
  const isDouble = (left.kind === 'primitive' && (left.javaType === 'double' || left.javaType === 'float'))
    || (right.kind === 'primitive' && (right.javaType === 'double' || right.javaType === 'float'));

  switch (op) {
    case '+': return isDouble ? javaDouble(l + r) : javaInt((l + r) | 0);
    case '-': return isDouble ? javaDouble(l - r) : javaInt((l - r) | 0);
    case '*': return isDouble ? javaDouble(l * r) : javaInt(Math.imul(l | 0, r | 0));
    case '/':
      if (r === 0) throw new InterpreterError('ArithmeticException: / by zero', 0);
      return isDouble ? javaDouble(l / r) : javaInt((l / r) | 0);
    case '%':
      if (r === 0) throw new InterpreterError('ArithmeticException: / by zero', 0);
      return isDouble ? javaDouble(l % r) : javaInt((l % r) | 0);
    case '<': return javaBool(l < r);
    case '>': return javaBool(l > r);
    case '<=': return javaBool(l <= r);
    case '>=': return javaBool(l >= r);
    case '==': return javaBool(javaValuesEqual(left, right));
    case '!=': return javaBool(!javaValuesEqual(left, right));
    case '&': return javaInt((l | 0) & (r | 0));
    case '|': return javaInt((l | 0) | (r | 0));
    case '^': return javaInt((l | 0) ^ (r | 0));
    case '<<': return javaInt((l | 0) << (r | 0));
    case '>>': return javaInt((l | 0) >> (r | 0));
    case '>>>': return javaInt((l | 0) >>> (r | 0));
    case '&&': return javaBool(javaValueToBoolean(left) && javaValueToBoolean(right));
    case '||': return javaBool(javaValueToBoolean(left) || javaValueToBoolean(right));
    default: return javaNull();
  }
}

function getFirstToken(node: CstNode | CstToken): CstToken | null {
  if (isCstToken(node)) return node;
  for (const items of Object.values(node.children)) {
    for (const item of items) {
      const t = getFirstToken(item);
      if (t) return t;
    }
  }
  return null;
}
