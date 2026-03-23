import { useEffect, useState, useRef, useCallback } from 'react';
import { Toast, ToastContainer, Button } from 'react-bootstrap';
import AppNavbar from './components/AppNavbar';
import ControlBar from './components/ControlBar';
import EditorPanel from './components/EditorPanel';
import VisualizationPanel from './components/VisualizationPanel';
import { useStore } from './store/useStore';
import { runCode } from './engine/executor';

export default function App({ embed = false }: { embed?: boolean }) {
  const stepForward = useStore((s) => s.stepForward);
  const stepBackward = useStore((s) => s.stepBackward);
  const code = useStore((s) => s.code);

  const shouldShowToast = !embed && localStorage.getItem('jstutor-hide-warning') !== 'true';
  const [showToast, setShowToast] = useState(false);

  const [splitPercent, setSplitPercent] = useState(40);
  const dragging = useRef(false);
  const splitPercentRef = useRef(40);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<HTMLDivElement>(null);
  const [isStacked, setIsStacked] = useState(() => window.matchMedia('(max-width: 700px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const handler = () => setIsStacked(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isStacked ? 'ns-resize' : 'col-resize';
  }, [isStacked]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = isStacked
      ? ((e.clientY - rect.top) / rect.height) * 100
      : ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(80, Math.max(20, pct));
    splitPercentRef.current = clamped;
    // Direct DOM update avoids React re-renders during drag
    if (editorRef.current && vizRef.current) {
      if (isStacked) {
        editorRef.current.style.height = `${clamped}%`;
        vizRef.current.style.height = `${100 - clamped}%`;
      } else {
        editorRef.current.style.width = `${clamped}%`;
        vizRef.current.style.width = `${100 - clamped}%`;
      }
    }
  }, [isStacked]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    setSplitPercent(splitPercentRef.current);
  }, []);

  useEffect(() => {
    if (shouldShowToast) {
      const id = requestAnimationFrame(() => setShowToast(true));
      return () => cancelAnimationFrame(id);
    }
  }, [shouldShowToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.cm-editor')) {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          runCode(code);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        runCode(code);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stepForward, stepBackward, code]);

  return (
    <>
      {!embed && <AppNavbar />}
      <ControlBar embed={embed} />

      <div
        className="main-layout"
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          ref={editorRef}
          className="editor-column border-end"
          style={isStacked ? { width: '100%', height: `${splitPercent}%` } : { width: `${splitPercent}%` }}
        >
          <EditorPanel />
        </div>
        <div
          className="split-divider"
          style={{ cursor: isStacked ? 'ns-resize' : 'col-resize' }}
          onPointerDown={onPointerDown}
        />
        <div
          ref={vizRef}
          className="viz-column"
          style={isStacked ? { width: '100%', height: `${100 - splitPercent}%` } : { width: `${100 - splitPercent}%` }}
        >
          <VisualizationPanel />
        </div>
      </div>

      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1080 }}>
        <Toast show={showToast} onClose={() => setShowToast(false)} animation>
          <Toast.Header closeButton>
            <strong className="me-auto">⚠️ Experimental Tool</strong>
          </Toast.Header>
          <Toast.Body>
            This tool is currently experimental and may produce inaccurate visualizations.
            <div className="mt-2">
              <Button
                variant="dark"
                size="sm"
                onClick={() => {
                  localStorage.setItem('jstutor-hide-warning', 'true');
                  setShowToast(false);
                }}
              >
                Don't Show Again
              </Button>
            </div>
          </Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}
