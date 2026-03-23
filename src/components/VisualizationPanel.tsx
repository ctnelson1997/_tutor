import { useRef } from 'react';
import FramesView from './FramesView';
import HeapView from './HeapView';
import ConsolePanel from './ConsolePanel';
import PointerArrows from './PointerArrows';
import { useStore } from '../store/useStore';

export default function VisualizationPanel() {
  const hasSnapshots = useStore((s) => s.snapshots.length > 0);
  const vizRef = useRef<HTMLDivElement>(null);

  return (
    <div className="d-flex flex-column h-100">
      <div className="viz-scroll p-2" ref={vizRef} style={{ position: 'relative' }}>
        {!hasSnapshots ? (
          <div className="text-center text-muted mt-5">
            <p className="fw-semibold fs-5">Memory Visualization</p>
            <p>Write some code and click <strong>Visualize</strong> to see how it runs step by step.</p>
          </div>
        ) : (
          <div className="d-flex flex-wrap gap-3">
            <div style={{ minWidth: '200px', flex: '1 1 40%' }}>
              <div className="text-muted mb-2" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Frames
              </div>
              <FramesView />
            </div>
            <div style={{ minWidth: '200px', flex: '1 1 55%' }}>
              <div className="text-muted mb-2" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Objects
              </div>
              <HeapView />
            </div>
            <PointerArrows containerRef={vizRef} />
          </div>
        )}
      </div>
      <ConsolePanel />
    </div>
  );
}
