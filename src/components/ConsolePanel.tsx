import { memo, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import type { ConsoleLine } from '../types/snapshot';

export default memo(function ConsolePanel() {
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);
  const error = useStore((s) => s.error);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Memoize so the empty-array fallback isn't a new reference each render
  // (which would re-fire the scroll effect below).
  // The console in program order: stdout lines, and once the program wrote to
  // stderr (System.err, printStackTrace), its stderr lines among them.
  const lines = useMemo((): ConsoleLine[] => {
    const snapshot = snapshots.length > 0 ? snapshots[currentStep] : undefined;
    if (!snapshot) return [];
    return snapshot.console ?? snapshot.stdout.map(text => ({ text, stream: 'stdout' as const }));
  }, [snapshots, currentStep]);
  // What an uncaught exception prints to stderr (Java's stack trace, Python's
  // traceback) appears after the output at the last step, as in a terminal.
  const atEnd = snapshots.length === 0 || currentStep === snapshots.length - 1;
  const stderr = useMemo(
    () => (atEnd && error?.stderr ? error.stderr.split('\n') : []),
    [atEnd, error],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, stderr]);

  // Drag-to-resize logic (pointer events work on both mouse and touch)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    const startY = e.clientY;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const startHeight = wrapper.getBoundingClientRect().height;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY; // dragging up = bigger
      const newHeight = Math.max(60, Math.min(window.innerHeight * 0.6, startHeight + delta));
      wrapper.style.height = `${newHeight}px`;
    };

    const onPointerUp = () => {
      setDragging(false);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, []);

  return (
    <div ref={wrapperRef} className="console-panel-wrapper">
      <div
        className={`console-resize-handle${dragging ? ' active' : ''}`}
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize console panel. Use up/down arrow keys to adjust height."
        tabIndex={0}
        onKeyDown={(e) => {
          const wrapper = wrapperRef.current;
          if (!wrapper) return;
          const curr = wrapper.getBoundingClientRect().height;
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            wrapper.style.height = `${Math.min(window.innerHeight * 0.6, curr + 20)}px`;
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            wrapper.style.height = `${Math.max(60, curr - 20)}px`;
          }
        }}
      />
      <div className="console-panel">
        <div style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '0.25rem' }}>
          Console Output
        </div>
        {lines.length === 0 && stderr.length === 0 ? (
          <div style={{ color: '#999', fontStyle: 'italic' }}>No output yet</div>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className={line.stream === 'stderr' ? 'log-error' : undefined}>{line.text}</div>
            ))}
            {stderr.map((line, i) => (
              <div key={`stderr-${i}`} className="log-error">{line}</div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
