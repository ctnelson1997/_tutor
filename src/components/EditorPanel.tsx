import { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, Decoration, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { useStore } from '../store/useStore';
import { useEngine } from '../engines/useEngine';
import type { ColumnRange, ConditionResult } from '../types/snapshot';

// ── Line highlight via CodeMirror state effect ──

interface HighlightInfo {
  line: number;
  columnRange?: ColumnRange;
}

const setHighlightLine = StateEffect.define<HighlightInfo | null>();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlightLine)) {
        if (effect.value === null) return Decoration.none;
        const { line, columnRange } = effect.value;
        if (line < 1 || line > tr.state.doc.lines) return Decoration.none;
        const lineObj = tr.state.doc.line(line);
        if (columnRange) {
          // Sub-line highlight for specific expression (e.g. for-loop parts)
          const from = lineObj.from + columnRange.startCol;
          const to = lineObj.from + columnRange.endCol;
          const mark = Decoration.mark({ class: 'cm-current-step-highlight' });
          return Decoration.set([mark.range(from, to)]);
        }
        const deco = Decoration.line({ class: 'cm-current-step-line' });
        return Decoration.set([deco.range(lineObj.from)]);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Condition result widget ──

const setCondition = StateEffect.define<ConditionResult | null>();

class ConditionWidget extends WidgetType {
  result: boolean;
  expression: string;

  constructor(result: boolean, expression: string) {
    super();
    this.result = result;
    this.expression = expression;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = `condition-badge condition-${this.result ? 'true' : 'false'}`;
    span.textContent = this.result ? 'true' : 'false';
    span.title = `${this.expression} → ${this.result}`;
    return span;
  }

  eq(other: ConditionWidget) {
    return this.result === other.result && this.expression === other.expression;
  }
}

const conditionField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCondition)) {
        if (effect.value === null) return Decoration.none;
        const { result, expression, line } = effect.value;
        if (line < 1 || line > tr.state.doc.lines) return Decoration.none;
        const lineObj = tr.state.doc.line(line);
        const widget = Decoration.widget({
          widget: new ConditionWidget(result, expression),
          side: 1,
        });
        return Decoration.set([widget.range(lineObj.to)]);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export default function EditorPanel() {
  const code = useStore((s) => s.code);
  const setCode = useStore((s) => s.setCode);
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);
  const error = useStore((s) => s.error);
  const reset = useStore((s) => s.reset);

  const language = useStore((s) => s.language);
  const engine = useEngine(language);
  const extensions = useMemo(
    () => [engine?.editorExtension() ?? [], highlightField, conditionField],
    [engine],
  );

  const onChange = useCallback(
    (value: string) => {
      if (snapshots.length > 0) reset();
      setCode(value);
    },
    [setCode, reset, snapshots.length],
  );

  // Determine which line to highlight
  const snapshot = snapshots.length > 0 ? snapshots[currentStep] : null;
  const highlightInfo: HighlightInfo | null = snapshot
    ? { line: snapshot.line, columnRange: snapshot.columnRange }
    : null;
  const condition = snapshot?.condition ?? null;

  // Update the highlight decoration when step changes
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      // Store the view reference for later updates
      (window as unknown as Record<string, unknown>).__cmView = view;
    },
    [],
  );

  // Keep highlight and condition badge in sync via effect dispatches.
  // We use a stable reference string to detect changes, including
  // same-line conditions with different results.
  const conditionKey = condition
    ? `${condition.line}:${condition.result}:${condition.expression}`
    : null;

  const onUpdate = useCallback(
    (viewUpdate: { view: EditorView }) => {
      const view = viewUpdate.view;
      const effects: StateEffect<unknown>[] = [];

      // Check if highlight needs updating
      const decoSet = view.state.field(highlightField);
      let currentlyHighlighted: number | null = null;
      const iter = decoSet.iter();
      if (iter.value) {
        currentlyHighlighted = view.state.doc.lineAt(iter.from).number;
      }
      if (currentlyHighlighted !== (highlightInfo?.line ?? null) || highlightInfo?.columnRange) {
        effects.push(setHighlightLine.of(highlightInfo));
      }

      // Sync condition badge only when it changed (dispatching unconditionally
      // would re-trigger onUpdate, causing infinite recursion / stack overflow).
      const currentConditionSet = view.state.field(conditionField);
      const hasConditionDeco = currentConditionSet.iter().value !== null;
      if (condition !== null || hasConditionDeco) {
        effects.push(setCondition.of(condition));
      }

      if (effects.length > 0) {
        view.dispatch({ effects });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlightInfo, conditionKey],
  );

  return (
    <div className="d-flex flex-column h-100">
      {/* Error display */}
      {error && (
        <div className="alert alert-danger m-2 py-1 px-2 mb-0" role="alert" style={{ fontSize: '0.85rem' }}>
          <strong>Error{error.line ? ` (line ${error.line})` : ''}:</strong> {error.message}
        </div>
      )}

      {/* CodeMirror editor — height="100%" sets .cm-editor + .cm-scroller
           via a theme extension; className="flex-grow-1" sets height on the
           wrapper div that @uiw/react-codemirror renders, completing the chain
           so the scroller actually constrains and scrolls. */}
      <CodeMirror
        className="flex-grow-1"
        style={{ minHeight: 0 }}
        height="100%"
        value={code}
        extensions={extensions}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        onUpdate={onUpdate}
        theme="light"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
        }}
      />
    </div>
  );
}
