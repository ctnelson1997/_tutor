/**
 * Prints an AST back to Java source (#12), for the round-trip tests and for
 * debugging. Parentheses come from Parens nodes, plus exactly those the tree
 * needs by precedence, so a correctly converted program prints the tokens it
 * was written with, and a tree with the wrong shape doesn't.
 */

import type * as A from './ast';

const INDENT = '  ';

/** Java source for a compilation unit. */
export function printAst(unit: A.CompilationUnit): string {
  const out: string[] = [];
  if (unit.package) out.push(`package ${unit.package.parts.join('.')};`, '');
  for (const i of unit.imports) out.push(`import ${i.isStatic ? 'static ' : ''}${i.name.parts.join('.')}${i.onDemand ? '.*' : ''};`);
  if (unit.imports.length) out.push('');
  for (const t of unit.types) out.push(t.kind === 'Unsupported' ? t.source : typeDecl(t, ''), '');
  return out.join('\n');
}

// ── Precedence ──

/** How tightly an expression binds: 1 assignment and lambda … 15 primary. */
function precedence(e: A.Expr): number {
  switch (e.kind) {
    case 'Assign': case 'Lambda': return 1;
    case 'Conditional': return 2;
    case 'Binary': return BINARY[e.op];
    case 'InstanceOf': return 9;
    case 'Unary': case 'Cast': return 13;
    case 'IncDec': return e.prefix ? 13 : 14;
    default: return 15;
  }
}

const BINARY: Record<A.BinaryOp, number> = {
  '||': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8,
  '<': 9, '>': 9, '<=': 9, '>=': 9, '<<': 10, '>>': 10, '>>>': 10,
  '+': 11, '-': 11, '*': 12, '/': 12, '%': 12,
};

/** An expression, in parentheses if it binds less tightly than `min`. */
function sub(e: A.Expr, min: number): string {
  const s = expr(e);
  return precedence(e) < min ? `(${s})` : s;
}

// ── Expressions ──

export function expr(e: A.Expr): string {
  switch (e.kind) {
    case 'Literal': return e.text;
    case 'Name': return e.parts.map(p => p.name).join('.');
    case 'This': return e.qualifier ? `${expr(e.qualifier)}.this` : 'this';
    case 'Super': return e.qualifier ? `${expr(e.qualifier)}.super` : 'super';
    case 'Parens': return `(${expr(e.expr)})`;
    case 'FieldAccess': return `${sub(e.target, 15)}.${e.name}`;
    case 'ArrayAccess': {
      // `new int[3][0]` would be a two-dimensional creation, not an access.
      const array = e.array.kind === 'NewArray' && !e.array.init ? `(${expr(e.array)})` : sub(e.array, 15);
      return `${array}[${expr(e.index)}]`;
    }
    case 'MethodCall': {
      const typeArgs = e.typeArgs ? `<${e.typeArgs.map(type).join(', ')}>` : '';
      const call = `${typeArgs}${e.name}(${e.args.map(expr).join(', ')})`;
      return e.target ? `${sub(e.target, 15)}.${call}` : call;
    }
    case 'NewObject': {
      const outer = e.outer ? `${sub(e.outer, 15)}.` : '';
      const typeArgs = e.typeArgs ? `<${e.typeArgs.map(type).join(', ')}> ` : '';
      const body = e.body ? ` ${classBody(e.body, '')}` : '';
      return `${outer}new ${typeArgs}${type(e.type)}${e.diamond ? '<>' : ''}(${e.args.map(expr).join(', ')})${body}`;
    }
    case 'NewArray': {
      const dims = e.dimExprs.map(d => `[${expr(d)}]`).join('') + '[]'.repeat(e.extraDims);
      return `new ${type(e.elementType)}${dims}${e.init ? ` ${arrayInit(e.init)}` : ''}`;
    }
    case 'ArrayInit': return arrayInit(e);
    case 'Unary': {
      const operand = sub(e.operand, 13);
      // `- -x` and `- --x`, not `--x` and `---x`.
      const gap = (e.op === '-' || e.op === '+') && operand.startsWith(e.op) ? ' ' : '';
      return `${e.op}${gap}${operand}`;
    }
    case 'IncDec': {
      if (!e.prefix) return `${sub(e.operand, 14)}${e.op}`;
      const operand = sub(e.operand, 13);
      return `${e.op}${operand.startsWith(e.op[0]) ? ' ' : ''}${operand}`;
    }
    case 'Binary': return `${sub(e.left, BINARY[e.op])} ${e.op} ${sub(e.right, BINARY[e.op] + 1)}`;
    case 'Assign': return `${sub(e.target, 13)} ${e.op} ${sub(e.value, 1)}`;
    case 'Conditional': return `${sub(e.cond, 3)} ? ${sub(e.then, 1)} : ${sub(e.else, 1)}`;
    case 'Cast': {
      const bounds = e.extraBounds.map(b => ` & ${type(b)}`).join('');
      // A reference type cast applies to a lambda or to an operand not starting with + or -: `(Integer) -x` is a subtraction.
      let operand: string;
      if (e.expr.kind === 'Lambda') operand = expr(e.expr);
      else if (e.type.kind !== 'PrimitiveType' && startsWithSign(e.expr)) operand = `(${expr(e.expr)})`;
      else operand = sub(e.expr, 13);
      return `(${type(e.type)}${bounds}) ${operand}`;
    }
    case 'InstanceOf': return `${sub(e.expr, 9)} instanceof ${e.pattern ? pattern(e.pattern) : type(e.type!)}`;
    case 'Lambda': {
      const params = e.params.map(lambdaParam).join(', ');
      const head = e.parenthesized ? `(${params})` : params;
      return `${head} -> ${e.body.kind === 'Block' ? block(e.body, '') : expr(e.body)}`;
    }
    case 'MethodRef': {
      const target = isTypeNode(e.target) ? type(e.target) : sub(e.target, 15);
      return `${target}::${e.typeArgs ? `<${e.typeArgs.map(type).join(', ')}>` : ''}${e.name}`;
    }
    case 'SwitchExpr': return `switch (${expr(e.selector)}) ${switchBody(e.body, '')}`;
    case 'ClassLiteral': return `${type(e.type)}.class`;
    case 'Unsupported': return e.source;
  }
}

function startsWithSign(e: A.Expr): boolean {
  return (e.kind === 'Unary' && (e.op === '+' || e.op === '-')) || (e.kind === 'IncDec' && e.prefix);
}

const TYPE_KINDS = new Set(['PrimitiveType', 'ClassType', 'ArrayType', 'VarType', 'VoidType', 'Wildcard']);

function isTypeNode(n: A.Expr | A.TypeNode): n is A.TypeNode {
  return TYPE_KINDS.has(n.kind);
}

function arrayInit(a: A.ArrayInit): string {
  const elements = a.elements.map(e => (e.kind === 'ArrayInit' ? arrayInit(e) : expr(e)));
  return `{${elements.join(', ')}${a.trailingComma ? ',' : ''}}`;
}

function lambdaParam(p: A.LambdaParam): string {
  if (!p.type) return p.name;
  return `${modifiers(p.modifiers)}${type(p.type)}${p.varargs ? '...' : ''} ${p.name}${'[]'.repeat(p.dims)}`;
}

// ── Types ──

export function type(t: A.TypeNode): string {
  switch (t.kind) {
    case 'PrimitiveType': return t.name;
    case 'ClassType': return t.parts.map(p => (p.typeArgs ? `${p.name}<${p.typeArgs.map(type).join(', ')}>` : p.name)).join('.');
    case 'ArrayType': return `${type(t.component)}[]`;
    case 'VarType': return 'var';
    case 'VoidType': return 'void';
    case 'Wildcard': return t.bound ? `? ${t.bound.kind} ${type(t.bound.type)}` : '?';
  }
}

function typeParams(params: A.TypeParam[]): string {
  if (!params.length) return '';
  return `<${params.map(p => `${p.annotations.map(a => `${a.source} `).join('')}${p.name}${p.bounds.length ? ` extends ${p.bounds.map(type).join(' & ')}` : ''}`).join(', ')}>`;
}

function modifiers(items: A.ModifierItem[]): string {
  return items.map(m => (typeof m === 'string' ? m : m.source) + ' ').join('');
}

// ── Patterns ──

function pattern(p: A.Pattern | A.MatchAllPattern): string {
  switch (p.kind) {
    case 'TypePattern': return `${modifiers(p.modifiers)}${type(p.type)} ${p.name}`;
    case 'RecordPattern': return `${type(p.type)}(${p.components.map(pattern).join(', ')})`;
    case 'MatchAllPattern': return '_';
  }
}

// ── Declarations ──

function typeDecl(d: A.TypeDecl, indent: string): string {
  switch (d.kind) {
    case 'ClassDecl': {
      const ext = d.superclass ? ` extends ${type(d.superclass)}` : '';
      const impl = d.interfaces.length ? ` implements ${d.interfaces.map(type).join(', ')}` : '';
      const permits = d.permits.length ? ` permits ${d.permits.map(type).join(', ')}` : '';
      return `${indent}${modifiers(d.modifiers)}class ${d.name}${typeParams(d.typeParams)}${ext}${impl}${permits} ${classBody(d.members, indent)}`;
    }
    case 'InterfaceDecl': {
      const ext = d.extends.length ? ` extends ${d.extends.map(type).join(', ')}` : '';
      const permits = d.permits.length ? ` permits ${d.permits.map(type).join(', ')}` : '';
      return `${indent}${modifiers(d.modifiers)}interface ${d.name}${typeParams(d.typeParams)}${ext}${permits} ${classBody(d.members, indent)}`;
    }
    case 'EnumDecl': {
      const impl = d.interfaces.length ? ` implements ${d.interfaces.map(type).join(', ')}` : '';
      const inner = indent + INDENT;
      const constants = d.constants.map(c => {
        const args = c.args ? `(${c.args.map(expr).join(', ')})` : '';
        const body = c.body ? ` ${classBody(c.body, inner)}` : '';
        return `${inner}${c.annotations.map(a => `${a.source} `).join('')}${c.name}${args}${body}`;
      });
      const lines = [`${indent}${modifiers(d.modifiers)}enum ${d.name}${impl} {`];
      if (constants.length) lines.push(constants.join(',\n') + (d.members.length ? ';' : ''));
      else if (d.members.length) lines.push(`${inner};`);
      for (const m of d.members) lines.push(member(m, inner));
      lines.push(`${indent}}`);
      return lines.join('\n');
    }
    case 'RecordDecl': {
      const impl = d.interfaces.length ? ` implements ${d.interfaces.map(type).join(', ')}` : '';
      return `${indent}${modifiers(d.modifiers)}record ${d.name}${typeParams(d.typeParams)}(${d.components.map(param).join(', ')})${impl} ${classBody(d.members, indent)}`;
    }
    case 'AnnotationTypeDecl': return indent + d.source;
  }
}

function classBody(members: A.Member[], indent: string): string {
  if (!members.length) return '{}';
  return `{\n${members.map(m => member(m, indent + INDENT)).join('\n')}\n${indent}}`;
}

function member(m: A.Member, indent: string): string {
  switch (m.kind) {
    case 'FieldDecl': return `${indent}${modifiers(m.modifiers)}${type(m.type)} ${m.declarators.map(declarator).join(', ')};`;
    case 'MethodDecl': {
      const tp = m.typeParams.length ? `${typeParams(m.typeParams)} ` : '';
      const ra = m.resultAnnotations.map(a => `${a.source} `).join('');
      const params = [...(m.receiver ? [receiver(m.receiver)] : []), ...m.params.map(param)].join(', ');
      const throws = m.throws.length ? ` throws ${m.throws.map(type).join(', ')}` : '';
      const body = m.body ? ` ${block(m.body, indent)}` : ';';
      return `${indent}${modifiers(m.modifiers)}${tp}${ra}${type(m.result)} ${m.name}(${params})${'[]'.repeat(m.dims)}${throws}${body}`;
    }
    case 'ConstructorDecl': {
      const tp = m.typeParams.length ? `${typeParams(m.typeParams)} ` : '';
      const params = [...(m.receiver ? [receiver(m.receiver)] : []), ...m.params.map(param)].join(', ');
      const throws = m.throws.length ? ` throws ${m.throws.map(type).join(', ')}` : '';
      const head = m.compact ? m.name : `${m.name}(${params})${throws}`;
      const statements = [...(m.explicitCall ? [`${indent + INDENT}${explicitCall(m.explicitCall)}`] : []), ...m.body.statements.map(s => stmt(s, indent + INDENT))];
      const body = statements.length ? `{\n${statements.join('\n')}\n${indent}}` : '{}';
      return `${indent}${modifiers(m.modifiers)}${tp}${head} ${body}`;
    }
    case 'Initializer': return `${indent}${m.isStatic ? 'static ' : ''}${block(m.body, indent)}`;
    case 'Unsupported': return indent + m.source;
    default: return typeDecl(m, indent);
  }
}

function explicitCall(c: A.ExplicitConstructorCall): string {
  const qualifier = c.qualifier ? `${expr(c.qualifier)}.` : '';
  const typeArgs = c.typeArgs ? `<${c.typeArgs.map(type).join(', ')}>` : '';
  return `${qualifier}${typeArgs}${c.target}(${c.args.map(expr).join(', ')});`;
}

function receiver(r: A.ReceiverParam): string {
  return `${r.annotations.map(a => `${a.source} `).join('')}${type(r.type)} ${r.qualifier ? `${r.qualifier}.` : ''}this`;
}

function param(p: A.Param): string {
  const varargs = p.varargs ? `${p.varargsAnnotations.map(a => ` ${a.source}`).join('')}...` : '';
  return `${modifiers(p.modifiers)}${type(p.type)}${varargs} ${p.name}${'[]'.repeat(p.dims)}`;
}

function declarator(d: A.VarDeclarator): string {
  const init = d.init ? ` = ${d.init.kind === 'ArrayInit' ? arrayInit(d.init) : expr(d.init)}` : '';
  return `${d.name}${'[]'.repeat(d.dims)}${init}`;
}

function localVarDecl(d: A.LocalVarDecl): string {
  return `${modifiers(d.modifiers)}${type(d.type)} ${d.declarators.map(declarator).join(', ')}`;
}

// ── Statements ──

function block(b: A.Block, indent: string): string {
  if (!b.statements.length) return '{}';
  return `{\n${b.statements.map(s => stmt(s, indent + INDENT)).join('\n')}\n${indent}}`;
}

/** A statement, its first line indented by `indent`. */
export function stmt(s: A.Stmt, indent: string): string {
  const body = (b: A.Stmt) => (b.kind === 'Block' ? ` ${block(b, indent)}` : `\n${stmt(b, indent + INDENT)}`);
  switch (s.kind) {
    case 'Block': return indent + block(s, indent);
    case 'LocalVarDecl': return `${indent}${localVarDecl(s)};`;
    case 'LocalClassDecl': return typeDecl(s.decl, indent);
    case 'ExprStmt': return `${indent}${expr(s.expr)};`;
    case 'If': {
      const head = `${indent}if (${expr(s.cond)})${body(s.then)}`;
      if (!s.else) return head;
      const sep = s.then.kind === 'Block' ? ' ' : `\n${indent}`;
      const otherwise = s.else.kind === 'If' ? ` ${stmt(s.else, indent).trimStart()}` : body(s.else);
      return `${head}${sep}else${otherwise}`;
    }
    case 'While': return `${indent}while (${expr(s.cond)})${body(s.body)}`;
    case 'DoWhile': return `${indent}do${body(s.body)}${s.body.kind === 'Block' ? ' ' : `\n${indent}`}while (${expr(s.cond)});`;
    case 'For': {
      const init = s.init ? (Array.isArray(s.init) ? s.init.map(expr).join(', ') : localVarDecl(s.init)) : '';
      return `${indent}for (${init}; ${s.cond ? expr(s.cond) : ''}; ${s.update.map(expr).join(', ')})${body(s.body)}`;
    }
    case 'ForEach': return `${indent}for (${localVarDecl(s.variable)} : ${expr(s.iterable)})${body(s.body)}`;
    case 'Labeled': return `${indent}${s.label}:${s.body.kind === 'Block' ? ` ${block(s.body, indent)}` : `\n${stmt(s.body, indent)}`}`;
    case 'SwitchStmt': return `${indent}switch (${expr(s.selector)}) ${switchBody(s.body, indent)}`;
    case 'Break': return `${indent}break${s.label ? ` ${s.label}` : ''};`;
    case 'Continue': return `${indent}continue${s.label ? ` ${s.label}` : ''};`;
    case 'Return': return `${indent}return${s.value ? ` ${expr(s.value)}` : ''};`;
    case 'Throw': return `${indent}throw ${expr(s.value)};`;
    case 'Yield': return `${indent}yield ${expr(s.value)};`;
    case 'Try': {
      const resources = s.resources.length || s.resourcesTrailingSemicolon
        ? ` (${s.resources.map(r => ('declarators' in r ? localVarDecl(r) : expr(r))).join('; ')}${s.resourcesTrailingSemicolon ? ';' : ''})`
        : '';
      const catches = s.catches.map(c => ` catch (${modifiers(c.modifiers)}${c.types.map(type).join(' | ')} ${c.name}) ${block(c.body, indent)}`).join('');
      return `${indent}try${resources} ${block(s.block, indent)}${catches}${s.finally ? ` finally ${block(s.finally, indent)}` : ''}`;
    }
    case 'Synchronized': return `${indent}synchronized (${expr(s.lock)}) ${block(s.body, indent)}`;
    case 'Assert': return `${indent}assert ${expr(s.cond)}${s.message ? ` : ${expr(s.message)}` : ''};`;
    case 'Empty': return `${indent};`;
    case 'Unsupported': return indent + s.source;
  }
}

function switchBody(b: A.SwitchBody, indent: string): string {
  const inner = indent + INDENT;
  if (b.kind === 'rules') {
    if (!b.rules.length) return '{}';
    const rules = b.rules.map(r => {
      const body = r.body.kind === 'Block' ? block(r.body, inner) : r.body.kind === 'Throw' ? stmt(r.body, '') : `${expr(r.body)};`;
      return `${inner}${switchLabel(r.label)} -> ${body}`;
    });
    return `{\n${rules.join('\n')}\n${indent}}`;
  }
  if (!b.groups.length) return '{}';
  const groups = b.groups.map(g => [`${inner}${switchLabel(g.label)}:`, ...g.statements.map(s => stmt(s, inner + INDENT))].join('\n'));
  return `{\n${groups.join('\n')}\n${indent}}`;
}

function switchLabel(l: A.SwitchLabel): string {
  if (l.isDefault) return 'default';
  if (l.isNull) return `case null${l.nullDefault ? ', default' : ''}`;
  if (l.patterns.length) return `case ${l.patterns.map(pattern).join(', ')}${l.guard ? ` when ${expr(l.guard)}` : ''}`;
  return `case ${l.constants.map(expr).join(', ')}`;
}
