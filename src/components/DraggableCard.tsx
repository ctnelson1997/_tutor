import { useRef, useCallback } from 'react';
import type { ReactNode, PointerEvent } from 'react';

const DRAG_THRESHOLD = 3;

export default function DraggableCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const start = useRef({ px: 0, py: 0, ox: 0, oy: 0 });
  const dragging = useRef(false);
  const captured = useRef(false);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    captured.current = true;
    dragging.current = false;
    start.current = {
      px: e.clientX,
      py: e.clientY,
      ox: offset.current.x,
      oy: offset.current.y,
    };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!captured.current) return;
    const el = ref.current;
    if (!el) return;

    const dx = e.clientX - start.current.px;
    const dy = e.clientY - start.current.py;

    if (!dragging.current) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      dragging.current = true;
      el.style.cursor = 'grabbing';
      el.style.zIndex = '100';
    }

    offset.current = {
      x: start.current.ox + dx,
      y: start.current.oy + dy,
    };
    el.style.transform = `translate(${offset.current.x}px, ${offset.current.y}px)`;
    window.dispatchEvent(new Event('arrows:redraw'));
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!captured.current) return;
    const el = ref.current;
    if (!el) return;
    el.releasePointerCapture(e.pointerId);
    captured.current = false;
    if (dragging.current) {
      el.style.cursor = '';
      el.style.zIndex = '';
      dragging.current = false;
    }
    window.dispatchEvent(new Event('arrows:redraw'));
  }, []);

  /** Double-click resets the card to its auto-layout position. */
  const onDoubleClick = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    offset.current = { x: 0, y: 0 };
    el.style.transform = '';
    window.dispatchEvent(new Event('arrows:redraw'));
  }, []);

  return (
    <div
      ref={ref}
      className="draggable-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}
