// ── Primitive values ──

export interface PrimitiveValue {
  type: 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'symbol' | 'bigint';
  value: string | number | boolean | null;
}

// ── Heap references ──

export interface HeapRef {
  type: 'ref';
  heapId: string;
}

export type RuntimeValue = PrimitiveValue | HeapRef;

// ── Heap objects ──

export interface Property {
  key: string;
  value: RuntimeValue;
}

export type CommonHeapObjectType =
  | 'object'
  | 'array'
  | 'function'
  | 'class'
  | 'date'
  | 'regexp'
  | 'map'
  | 'set'
  | 'error';

// Open union: engines can emit any string type (e.g. Python's 'dict', 'tuple')
export type HeapObjectType = CommonHeapObjectType | (string & {});

export interface HeapObject {
  id: string;
  objectType: HeapObjectType;
  label?: string;               // e.g. function name, class name
  properties: Property[];
  proto?: HeapRef;
}

// ── Stack frames ──

export interface Variable {
  name: string;
  value: RuntimeValue;
}

export interface StackFrame {
  name: string;
  variables: Variable[];
  isBlockScope?: boolean;
  closureVars?: Variable[];
  thisArg?: RuntimeValue;
}

// ── Execution snapshot ──

export interface ConditionResult {
  expression: string;
  result: boolean;
  line: number;
}

export interface ColumnRange {
  startCol: number;  // 0-indexed
  endCol: number;    // 0-indexed, exclusive
}

export interface ExecutionSnapshot {
  step: number;
  line: number;
  columnRange?: ColumnRange;
  callStack: StackFrame[];
  heap: HeapObject[];
  stdout: string[];
  condition?: ConditionResult;
}

// ── Execution result from the worker ──

export type WorkerMessage =
  | { type: 'result'; snapshots: ExecutionSnapshot[] }
  | { type: 'error'; message: string; line?: number };
