import { memo, useMemo } from 'react';
import { Card } from 'react-bootstrap';
import { useStore } from '../store/useStore';
import type { RuntimeValue, StackFrame } from '../types/snapshot';
import { getChangedKeys } from '../utils/diffSnapshots';

function ValueDisplay({ value }: { value: RuntimeValue }) {
  if (value.type === 'ref') {
    return (
      <span
        className="ref-dot"
        id={`ref-${value.heapId}`}
        title={`→ heap#${value.heapId}`}
      />
    );
  }

  // Primitive value
  const colorMap: Record<string, string> = {
    number: '#0d6efd',
    string: '#198754',
    boolean: '#fd7e14',
    null: '#6c757d',
    undefined: '#6c757d',
    symbol: '#6f42c1',
    bigint: '#0d6efd',
  };

  const color = colorMap[value.type] || '#333';
  const display =
    value.type === 'string'
      ? `"${value.value}"`
      : value.type === 'null'
        ? 'null'
        : value.type === 'undefined'
          ? 'undefined'
          : String(value.value);

  return (
    <span style={{ color, fontFamily: 'monospace', fontSize: '0.85rem' }}>
      {display}
    </span>
  );
}

/** Render a variable table for a list of variables. */
function VariableTable({ frame, frameIndex, changedKeys, step }: { frame: StackFrame; frameIndex: number; changedKeys: Set<string>; step: number }) {
  if (frame.variables.length === 0) return null;

  return (
    <table className="w-100">
      <tbody>
        {frame.variables.map((v) => {
          const isReturn = v.name === 'return \u21b5';
          const isChanged = changedKeys.has(`var:${frameIndex}:${v.name}`);
          return (
            <tr key={v.name} style={isReturn ? { borderTop: '1px dashed #0d6efd' } : undefined}>
              <td
                className="fw-semibold"
                style={{
                  fontFamily: 'monospace',
                  ...(isReturn ? { color: '#0d6efd', fontStyle: 'italic' } : {}),
                }}
              >
                {v.name}
              </td>
              <td className="text-end">
                <span key={isChanged ? step : undefined} className={isChanged ? 'value-changed' : undefined}>
                  <ValueDisplay value={v.value} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Recursive block-scope node (handles nested loops). */
interface BlockScopeNode {
  frame: StackFrame;
  index: number;
  children: BlockScopeNode[];
}

/** A frame group is a real frame plus a tree of block-scope frames nested inside it. */
interface FrameGroup {
  frame: StackFrame;
  index: number;
  blockScopes: BlockScopeNode[];
}

/** Group block-scope frames into a tree under their nearest real (non-block-scope) frame. */
function groupFrames(callStack: StackFrame[]): FrameGroup[] {
  const groups: FrameGroup[] = [];
  // Stack tracks the current nesting path of block-scope nodes
  let blockStack: BlockScopeNode[] = [];

  for (let i = 0; i < callStack.length; i++) {
    const frame = callStack[i];
    if (frame.isBlockScope && groups.length > 0) {
      const node: BlockScopeNode = { frame, index: i, children: [] };
      if (blockStack.length > 0) {
        // Nest inside the deepest current block scope
        blockStack[blockStack.length - 1].children.push(node);
      } else {
        // First block scope — attach to the parent group
        groups[groups.length - 1].blockScopes.push(node);
      }
      blockStack.push(node);
    } else {
      groups.push({ frame, index: i, blockScopes: [] });
      blockStack = [];
    }
  }
  return groups;
}

/** Recursively render a block-scope node and its children. */
function BlockScopeSection({ node, changedKeys, step }: { node: BlockScopeNode; changedKeys: Set<string>; step: number }) {
  return (
    <div className="block-scope-section">
      <div className="block-scope-label">{node.frame.name} block</div>
      <VariableTable frame={node.frame} frameIndex={node.index} changedKeys={changedKeys} step={step} />
      {node.children.map((child, i) => (
        <BlockScopeSection key={`${child.frame.name}-${i}`} node={child} changedKeys={changedKeys} step={step} />
      ))}
    </div>
  );
}

/** Render a closure variable table (uses "closure:" key prefix for change detection). */
function ClosureVariableTable({ frameIndex, frame, changedKeys, step }: { frameIndex: number; frame: StackFrame; changedKeys: Set<string>; step: number }) {
  if (!frame.closureVars || frame.closureVars.length === 0) return null;

  return (
    <table className="w-100">
      <tbody>
        {frame.closureVars.map((v) => {
          const isChanged = changedKeys.has(`closure:${frameIndex}:${v.name}`);
          return (
            <tr key={v.name}>
              <td
                className="fw-semibold"
                style={{ fontFamily: 'monospace' }}
              >
                {v.name}
              </td>
              <td className="text-end">
                <span key={isChanged ? step : undefined} className={isChanged ? 'value-changed' : undefined}>
                  <ValueDisplay value={v.value} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Render a this-context section showing the ref-dot to the receiver object. */
function ThisContextSection({ frameIndex, frame, changedKeys, step }: { frameIndex: number; frame: StackFrame; changedKeys: Set<string>; step: number }) {
  if (!frame.thisArg) return null;

  const isChanged = changedKeys.has(`this:${frameIndex}`);

  return (
    <div className="this-scope-section">
      <div className="this-scope-label">this</div>
      <table className="w-100">
        <tbody>
          <tr>
            <td className="fw-semibold" style={{ fontFamily: 'monospace' }}>this</td>
            <td className="text-end">
              <span key={isChanged ? step : undefined} className={isChanged ? 'value-changed' : undefined}>
                <ValueDisplay value={frame.thisArg} />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FrameCard({ group, changedKeys, step }: { group: FrameGroup; changedKeys: Set<string>; step: number }) {
  const isGlobal = group.index === 0;
  const variant = isGlobal ? 'secondary' : 'primary';
  const hasParentVars = group.frame.variables.length > 0;
  const hasBlockScopes = group.blockScopes.length > 0;
  const hasClosure = !!(group.frame.closureVars && group.frame.closureVars.length > 0);
  const hasThis = !!group.frame.thisArg;
  const isEmpty = !hasParentVars && !hasBlockScopes && !hasClosure && !hasThis;

  return (
    <Card className="frame-card mb-2" border={variant}>
      <Card.Header className={`bg-${variant} text-white`}>
        {group.frame.name}
      </Card.Header>
      <Card.Body>
        {isEmpty ? (
          <em className="text-muted" style={{ fontSize: '0.8rem' }}>No variables</em>
        ) : (
          <>
            {hasClosure && (
              <div className="closure-scope-section">
                <div className="closure-scope-label">Closure</div>
                <ClosureVariableTable frameIndex={group.index} frame={group.frame} changedKeys={changedKeys} step={step} />
              </div>
            )}
            {hasThis && (
              <ThisContextSection frameIndex={group.index} frame={group.frame} changedKeys={changedKeys} step={step} />
            )}
            <VariableTable frame={group.frame} frameIndex={group.index} changedKeys={changedKeys} step={step} />
            {group.blockScopes.map((node, i) => (
              <BlockScopeSection key={`${node.frame.name}-${i}`} node={node} changedKeys={changedKeys} step={step} />
            ))}
          </>
        )}
      </Card.Body>
    </Card>
  );
}

export default memo(function FramesView() {
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);

  const changedKeys = useMemo(
    () => getChangedKeys(snapshots[currentStep - 1], snapshots[currentStep]),
    [snapshots, currentStep],
  );

  const snapshot = snapshots.length > 0 ? snapshots[currentStep] : null;

  const reversed = useMemo(() => {
    if (!snapshot) return [];
    return [...groupFrames(snapshot.callStack)].reverse();
  }, [snapshot]);

  if (!snapshot) return null;

  return (
    <div>
      {reversed.map((group, i) => (
        <FrameCard key={`${group.frame.name}-${i}`} group={group} changedKeys={changedKeys} step={currentStep} />
      ))}
    </div>
  );
});
