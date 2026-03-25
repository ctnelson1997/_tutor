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
  has,
  getLine,
  isCstNode,
  isCstToken,
} from './parser';
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

function setVariable(scope: Scope, name: string, value: JavaValue, type: JavaType): void {
  scope.variables.set(name, { value, type });
}

function updateVariable(scope: Scope, name: string, value: JavaValue): boolean {
  if (scope.variables.has(name)) {
    const entry = scope.variables.get(name)!;
    entry.value = value;
    return true;
  }
  if (scope.parent) return updateVariable(scope.parent, name, value);
  return false;
}

/** Update the innermost call-stack frame's currentScope pointer. */
function setCurrentScope(callStack: { name: string; scope: Scope; currentScope: Scope }[], scope: Scope): void {
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
}

// ── Interpreter ──

export class JavaInterpreter {
  private snapshots: ExecutionSnapshot[] = [];
  private stdout: string[] = [];
  private heap: Map<string, JavaHeapEntry> = new Map();
  private nextHeapId = 1;
  private callStack: { name: string; scope: Scope; currentScope: Scope }[] = [];
  private methods: Map<string, MethodDef> = new Map();
  private staticFields: Scope = createScope(null);
  private step = 0;

  execute(cst: CstNode): { snapshots: ExecutionSnapshot[]; error?: string } {
    try {
      const compUnit = child(cst, 'ordinaryCompilationUnit');
      if (!compUnit) throw new InterpreterError('No compilation unit found', 0);

      const typeDecl = child(compUnit, 'typeDeclaration');
      if (!typeDecl) throw new InterpreterError('No type declaration found', 0);

      const classDecl = child(typeDecl, 'classDeclaration');
      if (!classDecl) throw new InterpreterError('No class declaration found', 0);

      const normalClass = child(classDecl, 'normalClassDeclaration');
      if (!normalClass) throw new InterpreterError('Only class declarations are supported', 0);

      const classBody = child(normalClass, 'classBody');
      if (!classBody) throw new InterpreterError('Empty class body', 0);

      // Collect all methods and static fields
      const bodyDecls = children(classBody, 'classBodyDeclaration');
      for (const bodyDecl of bodyDecls) {
        const memberDecl = child(bodyDecl, 'classMemberDeclaration');
        if (!memberDecl) continue;

        const methodDecl = child(memberDecl, 'methodDeclaration');
        if (methodDecl) {
          this.registerMethod(methodDecl);
          continue;
        }

        const fieldDecl = child(memberDecl, 'fieldDeclaration');
        if (fieldDecl) {
          this.registerStaticField(fieldDecl);
        }
      }

      // Initialize static fields
      this.initStaticFields();

      // Find and run main
      const mainMethod = this.methods.get('main');
      if (!mainMethod) throw new InterpreterError('No main method found', 0);

      const mainScope = createScope(this.staticFields);
      this.callStack.push({ name: 'main', scope: mainScope, currentScope: mainScope });
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
      const msg = e instanceof Error ? e.message : String(e);
      return { snapshots: this.snapshots, error: msg };
    }
  }

  // ── Method registration ──

  private registerMethod(methodDecl: CstNode): void {
    const header = child(methodDecl, 'methodHeader')!;
    const declarator = child(header, 'methodDeclarator')!;
    const nameToken = token(declarator, 'Identifier')!;
    const methodName = nameToken.image;

    const result = child(header, 'result');
    const returnType = result ? this.extractResultType(result) : 'void';

    const params: { name: string; type: JavaType }[] = [];
    const paramList = child(declarator, 'formalParameterList');
    if (paramList) {
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
    }

    const body = child(child(methodDecl, 'methodBody')!, 'block')!;
    const modifiers = children(methodDecl, 'methodModifier');
    const isStatic = modifiers.some(m => has(m, 'Static'));

    this.methods.set(methodName, { name: methodName, returnType, params, body, isStatic });
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

  private initStaticFields(): void {
    for (const [_name, entry] of this.staticFields.variables) {
      const asAny = entry as unknown as { initializer?: CstNode };
      if (asAny.initializer) {
        const val = this.evalVariableInitializer(asAny.initializer, entry.type, this.staticFields);
        entry.value = val;
        delete asAny.initializer;
      }
    }
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
      let baseType = 'int';
      if (prim) {
        if (has(prim, 'Boolean')) baseType = 'boolean';
        else {
          const numeric = child(prim, 'numericType');
          if (numeric) {
            const integral = child(numeric, 'integralType');
            if (integral) {
              if (has(integral, 'Int')) baseType = 'int';
              else if (has(integral, 'Long')) baseType = 'long';
              else if (has(integral, 'Byte')) baseType = 'byte';
              else if (has(integral, 'Short')) baseType = 'short';
              else if (has(integral, 'Char')) baseType = 'char';
            }
            const fp = child(numeric, 'floatingPointType');
            if (fp) {
              if (has(fp, 'Float')) baseType = 'float';
              else if (has(fp, 'Double')) baseType = 'double';
            }
          }
        }
      }
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

  private extractLocalVarType(localVarType: CstNode): JavaType {
    const unannType = child(localVarType, 'unannType');
    if (unannType) return this.extractUnannType(unannType);
    if (has(localVarType, 'Var')) return 'var';
    return 'Object';
  }

  // ── Snapshot emission ──

  private emitSnapshot(line: number): void {
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

    const heapObjects: HeapObject[] = [];
    for (const [id, entry] of this.heap) {
      if (isJavaArray(entry)) {
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
        heapObjects.push({
          id,
          objectType: 'object',
          label: entry.className,
          properties: Array.from(entry.fields.entries()).map(([k, v]) => ({
            key: k,
            value: this.javaToRuntime(v),
          })),
        });
      }
    }

    this.snapshots.push({
      step: this.step++,
      line,
      callStack,
      heap: heapObjects,
      stdout: [...this.stdout],
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

    if (iterValue.kind !== 'arrayRef') {
      throw new InterpreterError('Enhanced for loop requires an array', line);
    }

    const arr = this.heap.get(iterValue.heapId);
    if (!arr || !isJavaArray(arr)) {
      throw new InterpreterError('Enhanced for loop target is not an array', line);
    }

    setVariable(forScope, varName, defaultValue(type), type);
    let iterations = 0;

    for (const element of arr.elements) {
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
          if (e instanceof ContinueSignal) { /* fall through to condition check */ }
          else throw e;
        }
      }

      setCurrentScope(this.callStack, scope);
      const condExpr = child(doWhileStmt, 'expression')!;
      const condValue = this.evalExpression(condExpr, scope);
      this.emitSnapshot(line);
      if (!javaValueToBoolean(condValue)) break;
    } while (true);
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
    for (const [_key, items] of Object.entries(binExpr.children)) {
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

    // Separate operands and operators
    const operands: JavaValue[] = [];
    const operators: string[] = [];

    for (const item of allChildren) {
      if (isCstNode(item) && item.name === 'unaryExpression') {
        operands.push(this.evalUnaryExpression(item, scope));
      } else if (isCstNode(item) && item.name === 'expression') {
        // Right side of assignment
        operands.push(this.evalExpression(item, scope));
      } else if (isCstToken(item)) {
        const op = item.image;
        // Skip parentheses and other non-operator tokens
        if (['(', ')', '{', '}', '[', ']', ';', ','].includes(op)) continue;
        operators.push(op);
      }
    }

    if (operands.length === 0) return javaNull();
    if (operators.length === 0) return operands[0];

    // Handle assignment operators
    if (operators.length === 1 && isAssignmentOp(operators[0])) {
      return this.evalAssignment(binExpr, operators[0], scope);
    }

    // Evaluate left to right with precedence
    return this.evalOperatorChain(operands, operators);
  }

  private evalAssignment(binExpr: CstNode, op: string, scope: Scope): JavaValue {
    // Get the LHS unary expression for the target
    const unaryExprs = children(binExpr, 'unaryExpression');
    if (unaryExprs.length === 0) return javaNull();

    const lhsUnary = unaryExprs[0];
    const target = this.resolveAssignmentTarget(lhsUnary, scope);

    // Get the RHS - could be an expression child or the second unary expr
    const rhsExprs = children(binExpr, 'expression');
    let rhsValue: JavaValue;
    if (rhsExprs.length > 0) {
      rhsValue = this.evalExpression(rhsExprs[0], scope);
    } else if (unaryExprs.length > 1) {
      rhsValue = this.evalUnaryExpression(unaryExprs[1], scope);
    } else {
      return javaNull();
    }

    // Handle compound assignment
    if (op !== '=') {
      const currentValue = target.get();
      const baseOp = op.slice(0, -1); // '+=' -> '+'
      rhsValue = applyBinaryOp(baseOp, currentValue, rhsValue, this.heap);
    }

    target.set(rhsValue);
    return rhsValue;
  }

  private resolveAssignmentTarget(
    unaryExpr: CstNode,
    scope: Scope,
  ): { get: () => JavaValue; set: (v: JavaValue) => void } {
    const primary = child(child(unaryExpr, 'primary')!, 'primaryPrefix');
    if (!primary) throw new InterpreterError('Invalid assignment target', getLine(unaryExpr));

    const fqn = child(primary, 'fqnOrRefType');
    if (!fqn) throw new InterpreterError('Invalid assignment target', getLine(unaryExpr));

    const name = this.extractFqnName(fqn);

    // Check for array access suffix
    const primaryNode = child(unaryExpr, 'primary')!;
    const suffixes = children(primaryNode, 'primarySuffix');
    if (suffixes.length > 0) {
      const arrayAccess = child(suffixes[suffixes.length - 1], 'arrayAccessSuffix');
      if (arrayAccess) {
        const indexExpr = child(arrayAccess, 'expression')!;
        const indexVal = this.evalExpression(indexExpr, scope);
        const index = javaValueToNumber(indexVal);

        // For multi-dimensional: resolve up to the last suffix
        let arrValue = this.resolveVariable(name, scope);
        for (let i = 0; i < suffixes.length - 1; i++) {
          const suf = suffixes[i];
          const arrAccess = child(suf, 'arrayAccessSuffix');
          if (arrAccess) {
            const iExpr = child(arrAccess, 'expression')!;
            const iVal = javaValueToNumber(this.evalExpression(iExpr, scope));
            if (arrValue.kind !== 'arrayRef') throw new InterpreterError('Not an array', getLine(unaryExpr));
            const arr = this.heap.get(arrValue.heapId);
            if (!arr || !isJavaArray(arr)) throw new InterpreterError('Not an array', getLine(unaryExpr));
            arrValue = arr.elements[iVal];
          }
        }

        if (arrValue.kind !== 'arrayRef') throw new InterpreterError('Not an array', getLine(unaryExpr));
        const arr = this.heap.get(arrValue.heapId);
        if (!arr || !isJavaArray(arr)) throw new InterpreterError('Not an array', getLine(unaryExpr));
        const capturedArr = arr;
        const capturedIndex = index;

        return {
          get: () => capturedArr.elements[capturedIndex],
          set: (v) => { capturedArr.elements[capturedIndex] = v; },
        };
      }
    }

    // Simple variable assignment
    return {
      get: () => this.resolveVariable(name, scope),
      set: (v) => {
        if (!updateVariable(scope, name, v)) {
          // Try static fields
          if (!updateVariable(this.staticFields, name, v)) {
            setVariable(scope, name, v, this.inferType(v));
          }
        }
      },
    };
  }

  private resolveVariable(name: string, scope: Scope): JavaValue {
    const entry = lookupVariable(scope, name);
    if (entry) return entry.value;
    // Check static fields
    const staticEntry = lookupVariable(this.staticFields, name);
    if (staticEntry) return staticEntry.value;
    throw new InterpreterError(`Variable '${name}' is not defined`, 0);
  }

  private evalOperatorChain(operands: JavaValue[], operators: string[]): JavaValue {
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

    let vals = [...operands];
    let ops = [...operators];

    for (const group of precGroups) {
      const newVals: JavaValue[] = [vals[0]];
      const newOps: string[] = [];
      for (let i = 0; i < ops.length; i++) {
        if (group.includes(ops[i])) {
          const left = newVals.pop()!;
          const right = vals[i + 1];
          newVals.push(applyBinaryOp(ops[i], left, right, this.heap));
        } else {
          newVals.push(vals[i + 1]);
          newOps.push(ops[i]);
        }
      }
      vals = newVals;
      ops = newOps;
    }

    return vals[0];
  }

  private evalUnaryExpression(unary: CstNode, scope: Scope): JavaValue {
    // Check for prefix operator: UnaryPrefixOperator token (++, --, !, -, ~, +)
    const prefixOpToken = token(unary, 'UnaryPrefixOperator');
    if (prefixOpToken) {
      const op = prefixOpToken.image;
      const primary = child(unary, 'primary');
      if (!primary) return javaNull();
      const val = this.evalPrimary(primary, scope);

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
        case '++': {
          const newVal = javaInt(javaValueToNumber(val) + 1);
          this.updatePrimaryVariable(primary, scope, newVal);
          return newVal;
        }
        case '--': {
          const newVal = javaInt(javaValueToNumber(val) - 1);
          this.updatePrimaryVariable(primary, scope, newVal);
          return newVal;
        }
      }
      return val;
    }

    // Primary expression
    const primary = child(unary, 'primary');
    if (primary) {
      const val = this.evalPrimary(primary, scope);

      // Check for postfix operator: UnarySuffixOperator token (++, --)
      const suffixOpToken = token(unary, 'UnarySuffixOperator');
      if (suffixOpToken) {
        const op = suffixOpToken.image;
        const origVal = val;
        const delta = op === '++' ? 1 : -1;
        const newVal = javaInt(javaValueToNumber(val) + delta);
        this.updatePrimaryVariable(primary, scope, newVal);
        return origVal; // postfix returns original value
      }

      return val;
    }

    return javaNull();
  }

  /** Helper to update the variable referenced by a primary expression */
  private updatePrimaryVariable(primary: CstNode, scope: Scope, newVal: JavaValue): void {
    const prefix = child(primary, 'primaryPrefix');
    if (prefix) {
      const fqn = child(prefix, 'fqnOrRefType');
      if (fqn) {
        const name = this.extractFqnName(fqn);
        updateVariable(scope, name, newVal) || updateVariable(this.staticFields, name, newVal);
      }
    }
  }



  // ── Primary expression evaluation ──

  private evalPrimary(primary: CstNode, scope: Scope): JavaValue {
    const prefix = child(primary, 'primaryPrefix')!;
    let val = this.evalPrimaryPrefix(prefix, scope);

    // Apply suffixes (method calls, array access, field access)
    const suffixes = children(primary, 'primarySuffix');
    for (let i = 0; i < suffixes.length; i++) {
      val = this.evalPrimarySuffix(val, suffixes[i], scope, primary, i);
    }

    return val;
  }

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

    // new expression
    const newExpr = child(prefix, 'newExpression');
    if (newExpr) return this.evalNewExpression(newExpr, scope);

    // fqnOrRefType (variable reference, method call chain like System.out.println)
    const fqn = child(prefix, 'fqnOrRefType');
    if (fqn) {
      return this.evalFqnOrRefType(fqn, scope);
    }

    // this/super
    if (has(prefix, 'This')) return javaNull(); // simplified
    if (has(prefix, 'Super')) return javaNull(); // simplified

    return javaNull();
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

  private evalFqnOrRefType(fqn: CstNode, scope: Scope): JavaValue {
    // Build the full qualified name chain: ["System", "out", "println"] etc.
    const parts: string[] = [];

    const first = child(fqn, 'fqnOrRefTypePartFirst');
    if (first) {
      const common = child(first, 'fqnOrRefTypePartCommon');
      if (common) {
        const id = token(common, 'Identifier');
        if (id) parts.push(id.image);
      }
    }

    const rests = children(fqn, 'fqnOrRefTypePartRest');
    for (const rest of rests) {
      const common = child(rest, 'fqnOrRefTypePartCommon');
      if (common) {
        const id = token(common, 'Identifier');
        if (id) parts.push(id.image);
      }
    }

    if (parts.length === 0) return javaNull();

    // Single identifier - variable reference or method name
    if (parts.length === 1) {
      const name = parts[0];
      const entry = lookupVariable(scope, name) || lookupVariable(this.staticFields, name);
      if (entry) return entry.value;
      // Could be a method name (resolved later by methodInvocationSuffix)
      // or a class name. Return null to let the suffix handler deal with it.
      if (this.methods.has(name)) return javaNull();
      throw new InterpreterError(`Variable '${name}' is not defined`, getLine(fqn));
    }

    // Multi-part: handle known patterns
    // System.out.println / System.out.print
    if (parts[0] === 'System' && parts[1] === 'out') {
      // This will be handled by the suffix (methodInvocationSuffix)
      // Return a sentinel
      return { kind: 'objectRef', heapId: '__system_out__', className: 'PrintStream' } as JavaValue;
    }

    // Math.xxx
    if (parts[0] === 'Math') {
      // Will be handled by suffix
      return { kind: 'objectRef', heapId: '__math__', className: 'Math' } as JavaValue;
    }

    // Integer.xxx, Double.xxx etc
    if (['Integer', 'Double', 'Float', 'Long', 'Boolean', 'Character'].includes(parts[0])) {
      return { kind: 'objectRef', heapId: '__' + parts[0].toLowerCase() + '__', className: parts[0] } as JavaValue;
    }

    // Could be field access: obj.field
    if (parts.length === 2) {
      try {
        const obj = this.resolveVariable(parts[0], scope);
        if (obj.kind === 'arrayRef' && parts[1] === 'length') {
          const arr = this.heap.get(obj.heapId);
          if (arr && isJavaArray(arr)) return javaInt(arr.elements.length);
        }
        if (obj.kind === 'objectRef') {
          const objData = this.heap.get(obj.heapId);
          if (objData && isJavaObject(objData)) {
            const field = objData.fields.get(parts[1]);
            if (field) return field;
          }
        }
      } catch {
        // Not a variable, could be a class reference
      }
    }

    // String/array length special case for longer chains
    if (parts.length >= 2) {
      try {
        let current = this.resolveVariable(parts[0], scope);
        for (let i = 1; i < parts.length; i++) {
          if (current.kind === 'arrayRef' && parts[i] === 'length') {
            const arr = this.heap.get(current.heapId);
            if (arr && isJavaArray(arr)) {
              current = javaInt(arr.elements.length);
              continue;
            }
          }
          if (current.kind === 'objectRef') {
            const objData = this.heap.get(current.heapId);
            if (objData && isJavaObject(objData)) {
              const field = objData.fields.get(parts[i]);
              if (field) { current = field; continue; }
            }
          }
          break;
        }
        return current;
      } catch {
        // fall through
      }
    }

    return javaNull();
  }

  private extractFqnName(fqn: CstNode): string {
    const first = child(fqn, 'fqnOrRefTypePartFirst');
    if (first) {
      const common = child(first, 'fqnOrRefTypePartCommon');
      if (common) {
        const id = token(common, 'Identifier');
        if (id) return id.image;
      }
    }
    return '';
  }

  // ── Primary suffixes ──

  private evalPrimarySuffix(
    target: JavaValue,
    suffix: CstNode,
    scope: Scope,
    primary: CstNode,
    _suffixIndex: number,
  ): JavaValue {
    // Method invocation
    const methodSuffix = child(suffix, 'methodInvocationSuffix');
    if (methodSuffix) {
      return this.evalMethodInvocation(target, methodSuffix, scope, primary);
    }

    // Array access
    const arrayAccess = child(suffix, 'arrayAccessSuffix');
    if (arrayAccess) {
      const indexExpr = child(arrayAccess, 'expression')!;
      const indexVal = this.evalExpression(indexExpr, scope);
      const index = javaValueToNumber(indexVal);

      if (target.kind === 'arrayRef') {
        const arr = this.heap.get(target.heapId);
        if (arr && isJavaArray(arr)) {
          if (index < 0 || index >= arr.elements.length) {
            throw new InterpreterError(
              `ArrayIndexOutOfBoundsException: Index ${index} out of bounds for length ${arr.elements.length}`,
              getLine(suffix),
            );
          }
          return arr.elements[index];
        }
      }
      if (target.kind === 'string') {
        // String charAt via bracket access (not standard Java but handle gracefully)
        return javaChar(target.value.charCodeAt(index));
      }
      throw new InterpreterError('Cannot index non-array value', getLine(suffix));
    }

    return target;
  }

  // ── Method invocation ──

  private evalMethodInvocation(
    target: JavaValue,
    methodSuffix: CstNode,
    scope: Scope,
    primary: CstNode,
  ): JavaValue {
    // Get the method name from the fqnOrRefType chain
    const prefix = child(primary, 'primaryPrefix')!;
    const fqn = child(prefix, 'fqnOrRefType');
    const parts: string[] = [];

    if (fqn) {
      const first = child(fqn, 'fqnOrRefTypePartFirst');
      if (first) {
        const common = child(first, 'fqnOrRefTypePartCommon');
        if (common) {
          const id = token(common, 'Identifier');
          if (id) parts.push(id.image);
        }
      }
      const rests = children(fqn, 'fqnOrRefTypePartRest');
      for (const rest of rests) {
        const common = child(rest, 'fqnOrRefTypePartCommon');
        if (common) {
          const id = token(common, 'Identifier');
          if (id) parts.push(id.image);
        }
      }
    }

    // Evaluate arguments
    const args: JavaValue[] = [];
    const argList = child(methodSuffix, 'argumentList');
    if (argList) {
      for (const argExpr of children(argList, 'expression')) {
        args.push(this.evalExpression(argExpr, scope));
      }
    }

    const methodName = parts[parts.length - 1] || '';

    // System.out.println / System.out.print
    if (parts.length >= 3 && parts[0] === 'System' && parts[1] === 'out') {
      if (methodName === 'println') {
        const str = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
        this.stdout.push(str);
        return javaNull();
      }
      if (methodName === 'print') {
        const str = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
        if (this.stdout.length === 0) this.stdout.push('');
        this.stdout[this.stdout.length - 1] += str;
        return javaNull();
      }
    }

    // Math methods
    if (parts.length >= 2 && parts[0] === 'Math') {
      return this.evalMathMethod(methodName, args);
    }

    // Integer.parseInt, Double.parseDouble, etc.
    if (parts.length >= 2 && ['Integer', 'Double', 'Float', 'Long', 'Boolean'].includes(parts[0])) {
      return this.evalWrapperMethod(parts[0], methodName, args);
    }

    // String methods on a variable
    if (parts.length === 2) {
      const varName = parts[0];
      try {
        const obj = this.resolveVariable(varName, scope);
        if (obj.kind === 'string') {
          return this.evalStringMethod(obj.value, methodName, args);
        }
        if (obj.kind === 'arrayRef') {
          // Array doesn't have many methods in Java, but handle toString
          if (methodName === 'toString') {
            return javaString(javaValueToString(obj, this.heap));
          }
        }
      } catch {
        // Not a variable
      }
    }

    // Single name - must be a user-defined static method
    if (parts.length === 1) {
      const method = this.methods.get(methodName);
      if (method) {
        return this.callMethod(method, args);
      }
    }

    // Method on last part (might be chained)
    if (parts.length >= 2) {
      // Try to resolve as method on the target value
      if (target.kind === 'string') {
        return this.evalStringMethod(target.value, methodName, args);
      }
    }

    throw new InterpreterError(`Unknown method: ${parts.join('.')}()`, 0);
  }

  private callMethod(method: MethodDef, args: JavaValue[]): JavaValue {
    const methodScope = createScope(this.staticFields);

    // Bind parameters
    for (let i = 0; i < method.params.length; i++) {
      const param = method.params[i];
      const arg = i < args.length ? args[i] : defaultValue(param.type);
      setVariable(methodScope, param.name, arg, param.type);
    }

    this.callStack.push({ name: method.name, scope: methodScope, currentScope: methodScope });
    try {
      this.executeBlock(method.body, methodScope);
    } catch (e) {
      if (e instanceof ReturnSignal) {
        this.callStack.pop();
        return e.value;
      }
      throw e;
    }
    this.callStack.pop();
    return javaNull();
  }

  // ── new expression ──

  private evalNewExpression(newExpr: CstNode, scope: Scope): JavaValue {
    // Array creation: new int[5], new int[]{1, 2, 3}
    const arrayCreation = child(newExpr, 'arrayCreationExpression');
    if (arrayCreation) {
      return this.evalArrayCreation(arrayCreation, scope);
    }

    // Object creation: new ClassName(args) — not yet fully supported
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
      const numeric = child(primType, 'numericType');
      if (numeric) {
        const integral = child(numeric, 'integralType');
        if (integral) {
          if (has(integral, 'Int')) elementType = 'int';
          else if (has(integral, 'Long')) elementType = 'long';
          else if (has(integral, 'Char')) elementType = 'char';
          else if (has(integral, 'Byte')) elementType = 'byte';
          else if (has(integral, 'Short')) elementType = 'short';
        }
        const fp = child(numeric, 'floatingPointType');
        if (fp) {
          if (has(fp, 'Double')) elementType = 'double';
          else if (has(fp, 'Float')) elementType = 'float';
        }
      }
      if (has(primType, 'Boolean')) elementType = 'boolean';
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
    const withInit = child(arrayCreation, 'arrayCreationExpressionWithInitializerSuffix');
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
    if (className === 'ArrayList') {
      const heapId = this.allocObject('ArrayList', new Map([
        ['size', javaInt(0)],
      ]));
      // Store internal array
      this.heap.set(heapId + '_data', { elementType: 'Object', elements: [] });
      const obj = this.heap.get(heapId) as JavaObject;
      obj.fields.set('__data__', { kind: 'arrayRef', heapId: heapId + '_data' });
      return { kind: 'objectRef', heapId, className: 'ArrayList' };
    }

    if (className === 'HashMap') {
      const heapId = this.allocObject('HashMap', new Map());
      return { kind: 'objectRef', heapId, className: 'HashMap' };
    }

    if (className === 'StringBuilder' || className === 'StringBuffer') {
      const initial = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
      const heapId = this.allocObject(className, new Map([
        ['value', javaString(initial)],
      ]));
      return { kind: 'objectRef', heapId, className };
    }

    // Generic object — create with empty fields
    const heapId = this.allocObject(className, new Map());
    return { kind: 'objectRef', heapId, className };
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
      default:
        throw new InterpreterError(`Unknown String method: ${method}()`, 0);
    }
  }

  private evalMathMethod(method: string, args: JavaValue[]): JavaValue {
    const a = args.length > 0 ? javaValueToNumber(args[0]) : 0;
    const b = args.length > 1 ? javaValueToNumber(args[1]) : 0;

    switch (method) {
      case 'abs': return javaDouble(Math.abs(a));
      case 'max': return javaDouble(Math.max(a, b));
      case 'min': return javaDouble(Math.min(a, b));
      case 'pow': return javaDouble(Math.pow(a, b));
      case 'sqrt': return javaDouble(Math.sqrt(a));
      case 'floor': return javaInt(Math.floor(a));
      case 'ceil': return javaInt(Math.ceil(a));
      case 'round': return javaInt(Math.round(a));
      case 'random': return javaDouble(Math.random());
      case 'log': return javaDouble(Math.log(a));
      case 'sin': return javaDouble(Math.sin(a));
      case 'cos': return javaDouble(Math.cos(a));
      case 'tan': return javaDouble(Math.tan(a));
      case 'PI': return javaDouble(Math.PI);
      default:
        throw new InterpreterError(`Unknown Math method: ${method}()`, 0);
    }
  }

  private evalWrapperMethod(className: string, method: string, args: JavaValue[]): JavaValue {
    const arg = args.length > 0 ? args[0] : javaNull();
    const str = javaValueToString(arg, this.heap);

    switch (className) {
      case 'Integer':
        if (method === 'parseInt' || method === 'valueOf') return javaInt(parseInt(str, 10) || 0);
        if (method === 'toString') return javaString(String(javaValueToNumber(arg)));
        if (method === 'MAX_VALUE') return javaInt(2147483647);
        if (method === 'MIN_VALUE') return javaInt(-2147483648);
        break;
      case 'Double':
        if (method === 'parseDouble' || method === 'valueOf') return javaDouble(parseFloat(str) || 0);
        if (method === 'toString') return javaString(String(javaValueToNumber(arg)));
        break;
      case 'Boolean':
        if (method === 'parseBoolean' || method === 'valueOf') return javaBool(str === 'true');
        break;
    }
    throw new InterpreterError(`Unknown method: ${className}.${method}()`, 0);
  }
}

// ── Helpers ──

function isAssignmentOp(op: string): boolean {
  return ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='].includes(op);
}

function applyBinaryOp(op: string, left: JavaValue, right: JavaValue, heap: Map<string, JavaHeapEntry>): JavaValue {
  // String concatenation: if either side is a string and op is +
  if (op === '+' && (left.kind === 'string' || right.kind === 'string')) {
    return javaString(javaValueToString(left, heap) + javaValueToString(right, heap));
  }

  // Also handle string + non-string (Java auto-converts to string)
  if (op === '+') {
    // Check if left is a string concatenation chain
    const lStr = left.kind === 'string';
    const rStr = right.kind === 'string';
    if (lStr || rStr) {
      return javaString(javaValueToString(left, heap) + javaValueToString(right, heap));
    }
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

class InterpreterError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(line > 0 ? `Line ${line}: ${message}` : message);
    this.line = line;
  }
}
