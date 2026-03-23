import { memo, useState, useMemo } from 'react';
import { Card, ButtonGroup, Button } from 'react-bootstrap';
import { useStore } from '../store/useStore';
import { useEngine } from '../engines/useEngine';
import type { HeapObject, RuntimeValue, StackFrame } from '../types/snapshot';
import type { HeapTypeDisplay } from '../types/engine';
import { getChangedKeys } from '../utils/diffSnapshots';

function ValueDisplay({ value }: { value: RuntimeValue }) {
  if (value.type === 'ref') {
    return (
      <span
        className="ref-dot"
        id={`heap-ref-${value.heapId}`}
        title={`→ heap#${value.heapId}`}
      />
    );
  }

  const display =
    value.type === 'string'
      ? `"${value.value}"`
      : value.type === 'null'
        ? 'null'
        : value.type === 'undefined'
          ? 'undefined'
          : String(value.value);

  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
      {display}
    </span>
  );
}

function ArrayDisplay({ obj, changedKeys, step }: { obj: HeapObject; changedKeys: Set<string>; step: number }) {
  return (
    <div className="array-cells">
      {obj.properties.map((prop, i) => {
        const isChanged = changedKeys.has(`heap:${obj.id}:${prop.key}`);
        return (
          <div key={isChanged ? `${i}-${step}` : i} className={`array-cell${isChanged ? ' value-changed' : ''}`}>
            <span className="cell-index">{prop.key}</span>
            <ValueDisplay value={prop.value} />
          </div>
        );
      })}
      {obj.properties.length === 0 && (
        <div className="array-cell text-muted" style={{ fontStyle: 'italic' }}>
          empty
        </div>
      )}
    </div>
  );
}

function ObjectDisplay({ obj, changedKeys, step }: { obj: HeapObject; changedKeys: Set<string>; step: number }) {
  return (
    <table className="w-100">
      <tbody>
        {obj.properties.map((prop) => {
          const isChanged = changedKeys.has(`heap:${obj.id}:${prop.key}`);
          return (
            <tr key={prop.key}>
              <td style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8rem' }}>
                {prop.key}
              </td>
              <td className="text-end">
                <span key={isChanged ? step : undefined} className={isChanged ? 'value-changed' : undefined}>
                  <ValueDisplay value={prop.value} />
                </span>
              </td>
            </tr>
          );
        })}
        {obj.properties.length === 0 && (
          <tr>
            <td colSpan={2} className="text-muted" style={{ fontStyle: 'italic' }}>
              empty object
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function FunctionDisplay({ obj }: { obj: HeapObject }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
      <span style={{ color: '#6f42c1' }}>ƒ</span>{' '}
      {obj.label || 'anonymous'}()
    </div>
  );
}

const defaultTypeConfig: Record<string, HeapTypeDisplay> = {
  array: { label: 'Array', variant: 'info' },
  object: { label: 'Object', variant: 'warning' },
  function: { label: 'Function', variant: 'dark' },
  class: { label: 'Class', variant: 'warning' },
  date: { label: 'Date', variant: 'warning' },
  regexp: { label: 'RegExp', variant: 'warning' },
  map: { label: 'Map', variant: 'warning' },
  set: { label: 'Set', variant: 'warning' },
  error: { label: 'Error', variant: 'warning' },
};

function HeapCard({ obj, changedKeys, step, typeConfig }: { obj: HeapObject; changedKeys: Set<string>; step: number; typeConfig: Record<string, HeapTypeDisplay> }) {
  const config = typeConfig[obj.objectType] ?? { label: obj.objectType, variant: 'warning' };

  const label = obj.label
    ? `${config.label}: ${obj.label}`
    : config.label;

  const variant = config.variant;

  return (
    <Card className="heap-card mb-2" border={variant} id={`heap-${obj.id}`}>
      <Card.Header className={`bg-${variant} bg-opacity-25`}>
        {label}
        <span className="text-muted ms-1" style={{ fontSize: '0.65rem' }}>
          #{obj.id}
        </span>
      </Card.Header>
      <Card.Body>
        {obj.objectType === 'array' || obj.objectType === 'list' || obj.objectType === 'tuple' ? (
          <ArrayDisplay obj={obj} changedKeys={changedKeys} step={step} />
        ) : obj.objectType === 'function' ? (
          <FunctionDisplay obj={obj} />
        ) : (
          <ObjectDisplay obj={obj} changedKeys={changedKeys} step={step} />
        )}
      </Card.Body>
    </Card>
  );
}

type HeapFilter = 'all' | 'current';

/**
 * Collect all heap IDs reachable from the current execution context.
 * Walks the top frame (plus parent if top is a block scope), including
 * closure vars and thisArg, then transitively follows refs through
 * heap object properties.
 */
function reachableHeapIds(callStack: StackFrame[], heap: HeapObject[]): Set<string> {
  // Collect direct refs from the current execution context
  const directRefs = new Set<string>();

  function addVarRefs(frame: StackFrame) {
    for (const v of frame.variables) {
      if (v.value.type === 'ref') directRefs.add(v.value.heapId);
    }
    if (frame.closureVars) {
      for (const v of frame.closureVars) {
        if (v.value.type === 'ref') directRefs.add(v.value.heapId);
      }
    }
    if (frame.thisArg && frame.thisArg.type === 'ref') {
      directRefs.add(frame.thisArg.heapId);
    }
  }

  // Walk from the top frame upward through any block scopes to the owning function frame
  for (let i = callStack.length - 1; i >= 0; i--) {
    addVarRefs(callStack[i]);
    if (!callStack[i].isBlockScope) break;
  }

  // Transitively follow refs through heap object properties
  const heapMap = new Map<string, HeapObject>();
  for (const obj of heap) heapMap.set(obj.id, obj);

  const reachable = new Set<string>();
  function visit(id: string) {
    if (reachable.has(id)) return;
    reachable.add(id);
    const obj = heapMap.get(id);
    if (!obj) return;
    for (const prop of obj.properties) {
      if (prop.value.type === 'ref') visit(prop.value.heapId);
    }
  }
  for (const id of directRefs) visit(id);

  return reachable;
}

export default memo(function HeapView() {
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);
  const [filter, setFilter] = useState<HeapFilter>('all');
  const hideFunctions = useStore((s) => s.hideFunctions);
  const setHideFunctions = useStore((s) => s.setHideFunctions);
  const language = useStore((s) => s.language);

  const engine = useEngine(language);
  const typeConfig = useMemo(
    () => ({ ...defaultTypeConfig, ...engine?.heapTypeConfig }),
    [engine],
  );

  const snapshot = snapshots[currentStep];

  const changedKeys = useMemo(
    () => getChangedKeys(snapshots[currentStep - 1], snapshots[currentStep]),
    [snapshots, currentStep],
  );

  const visibleObjects = useMemo(() => {
    if (!snapshot || snapshot.heap.length === 0) return [];
    let objects = snapshot.heap;

    if (filter === 'current') {
      const reachable = reachableHeapIds(snapshot.callStack, snapshot.heap);
      objects = objects.filter((obj) => reachable.has(obj.id));
    }

    if (hideFunctions) {
      objects = objects.filter((obj) => obj.objectType !== 'function');
    }

    return objects;
  }, [snapshot, filter, hideFunctions]);

  if (snapshots.length === 0) return null;
  if (!snapshot || snapshot.heap.length === 0) {
    return <div className="text-muted" style={{ fontSize: '0.85rem' }}>No heap objects</div>;
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <ButtonGroup size="sm">
          <Button
            variant={filter === 'all' ? 'primary' : 'outline-primary'}
            onClick={() => setFilter('all')}
            style={{ fontSize: '0.7rem' }}
            aria-pressed={filter === 'all'}
          >
            All frames
          </Button>
          <Button
            variant={filter === 'current' ? 'primary' : 'outline-primary'}
            onClick={() => setFilter('current')}
            style={{ fontSize: '0.7rem' }}
            aria-pressed={filter === 'current'}
          >
            Current frame
          </Button>
        </ButtonGroup>
        <Button
          variant={hideFunctions ? 'secondary' : 'outline-secondary'}
          size="sm"
          onClick={() => setHideFunctions(!hideFunctions)}
          style={{ fontSize: '0.7rem' }}
          aria-pressed={hideFunctions}
        >
          Hide functions
        </Button>
      </div>
      {visibleObjects.length === 0 ? (
        <div className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
          No objects in this frame
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {visibleObjects.map((obj) => (
            <HeapCard key={obj.id} obj={obj} changedKeys={changedKeys} step={currentStep} typeConfig={typeConfig} />
          ))}
        </div>
      )}
    </div>
  );
});
