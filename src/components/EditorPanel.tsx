import { useEffect, useRef } from 'react';
import { EditorView, Decoration, WidgetType, GutterMarker, gutter, keymap, type DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSet } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { useStore } from '../store/useStore';
import { useEngine } from '../engines/useEngine';
import type { ColumnRange, ConditionResult } from '../types/snapshot';

// ── Line highlight via CodeMirror state effect ──

interface HighlightInfo {
  line: number;
  columnRange?: ColumnRange;
}

// ── Current line highlight ──

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

// ── Previous line highlight ──

const setPrevHighlightLine = StateEffect.define<HighlightInfo | null>();

const prevHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPrevHighlightLine)) {
        if (effect.value === null) return Decoration.none;
        const { line } = effect.value;
        if (line < 1 || line > tr.state.doc.lines) return Decoration.none;
        const lineObj = tr.state.doc.line(line);
        const deco = Decoration.line({ class: 'cm-previous-step-line' });
        return Decoration.set([deco.range(lineObj.from)]);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Step arrow gutter markers ──

class CurrentArrowMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-step-arrow cm-step-arrow-current';
    el.textContent = '▶';
    el.title = 'About to execute';
    return el;
  }
}

class PrevArrowMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-step-arrow cm-step-arrow-prev';
    el.textContent = '✓';
    el.title = 'Just executed';
    return el;
  }
}

const currentArrow = new CurrentArrowMarker();
const prevArrow = new PrevArrowMarker();

const gutterMarkerField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.of<GutterMarker>([]);
  },
  update(markers, tr) {
    let currentLine: number | null = null;
    let prevLine: number | null = null;

    for (const effect of tr.effects) {
      if (effect.is(setHighlightLine)) {
        currentLine = effect.value?.line ?? null;
      }
      if (effect.is(setPrevHighlightLine)) {
        prevLine = effect.value?.line ?? null;
      }
    }

    // Only rebuild if one of our effects fired
    if (currentLine === null && prevLine === null) return markers;

    const ranges: { from: number; marker: GutterMarker }[] = [];
    if (prevLine && prevLine >= 1 && prevLine <= tr.state.doc.lines) {
      if (prevLine !== currentLine) {
        ranges.push({ from: tr.state.doc.line(prevLine).from, marker: prevArrow });
      }
    }
    if (currentLine && currentLine >= 1 && currentLine <= tr.state.doc.lines) {
      ranges.push({ from: tr.state.doc.line(currentLine).from, marker: currentArrow });
    }

    // RangeSet requires sorted ranges
    ranges.sort((a, b) => a.from - b.from);
    return RangeSet.of<GutterMarker>(ranges.map((r) => r.marker.range(r.from)));
  },
});

const stepGutter = gutter({
  class: 'cm-step-gutter',
  markers: (v) => v.state.field(gutterMarkerField),
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

// ── Static extensions (never change at runtime) ──

const staticExtensions = [
  basicSetup({ lineNumbers: true, foldGutter: true, highlightActiveLine: false, drawSelection: false  }),
  keymap.of([indentWithTab]),
  highlightField,
  prevHighlightField,
  conditionField,
  gutterMarkerField,
  stepGutter,
  EditorView.theme({
    '&': { height: '100%', backgroundColor: '#fff' },
    '& .cm-scroller': { height: '100% !important' },
  }),
];

// ── Editor component ──

export default function EditorPanel() {
  const code = useStore((s) => s.code);
  const setCode = useStore((s) => s.setCode);
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);
  const error = useStore((s) => s.error);
  const reset = useStore((s) => s.reset);

  const language = useStore((s) => s.language);
  const engine = useEngine(language);

  // Refs so the CM6 updateListener always reads current values without
  // needing to reconfigure extensions (which would destroy selection state).
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const codeRef = useRef(code);
  const setCodeRef = useRef(setCode);
  const resetRef = useRef(reset);
  const snapshotsLenRef = useRef(snapshots.length);

  // Keep refs current every render
  codeRef.current = code;
  setCodeRef.current = setCode;
  resetRef.current = reset;
  snapshotsLenRef.current = snapshots.length;

  // ── Mount / unmount the EditorView ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !engine) return;

    const listener = EditorView.updateListener.of((vu) => {
      if (vu.docChanged) {
        const newVal = vu.state.doc.toString();
        if (snapshotsLenRef.current > 0) resetRef.current();
        setCodeRef.current(newVal);
      }
    });

    const state = EditorState.create({
      doc: codeRef.current,
      extensions: [...staticExtensions, engine.editorExtension(), listener],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    (window as unknown as Record<string, unknown>).__cmView = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create only when the language engine changes (once per page load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // ── Sync external value changes (example load, share link) into CM ──
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (code !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: code },
      });
    }
  }, [code]);

  // ── Highlight & condition badge sync ──
  const snapshot = snapshots.length > 0 ? snapshots[currentStep] : null;
  const prevSnapshot = currentStep > 0 ? snapshots[currentStep - 1] : null;
  const highlightInfo: HighlightInfo | null = snapshot
    ? { line: snapshot.line, columnRange: snapshot.columnRange }
    : null;
  const prevHighlightInfo: HighlightInfo | null = prevSnapshot
    ? { line: prevSnapshot.line }
    : null;
  const condition = snapshot?.condition ?? null;

  const conditionKey = condition
    ? `${condition.line}:${condition.result}:${condition.expression}`
    : null;

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        setHighlightLine.of(highlightInfo),
        setPrevHighlightLine.of(prevHighlightInfo),
        setCondition.of(condition),
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    highlightInfo?.line,
    highlightInfo?.columnRange?.startCol,
    highlightInfo?.columnRange?.endCol,
    prevHighlightInfo?.line,
    conditionKey,
  ]);

  return (
    <div className="d-flex flex-column h-100">
      {/* Error display */}
      {error && (
        <div className="alert alert-danger m-2 py-1 px-2 mb-0" role="alert" style={{ fontSize: '0.85rem' }}>
          <strong>Error{error.line ? ` (line ${error.line})` : ''}:</strong> {error.message}
        </div>
      )}

      {/* Direct CM6 editor — container div fills remaining space via flexbox */}
      <div
        ref={containerRef}
        className="flex-grow-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
