import { memo, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

interface Arrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Draws SVG arrows from every `.ref-dot[id^="ref-"]` element
 * to the corresponding `#heap-{heapId}` card.
 *
 * Must be rendered inside the scrollable viz container so that
 * positions are relative to the same coordinate space.
 */
export default memo(function PointerArrows({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafId = useRef(0);
  const currentStep = useStore((s) => s.currentStep);
  const snapshots = useStore((s) => s.snapshots);

  const computeArrows = useCallback((): Arrow[] => {
    const container = containerRef.current;
    if (!container) return [];

    const containerRect = container.getBoundingClientRect();
    const dots = container.querySelectorAll<HTMLElement>('.ref-dot');
    const arrows: Arrow[] = [];

    dots.forEach((dot) => {
      // FramesView uses id="ref-{heapId}", HeapView uses id="heap-ref-{heapId}"
      const heapId = dot.id.replace(/^(heap-)?ref-/, '');
      const target = container.querySelector<HTMLElement>(`#heap-${CSS.escape(heapId)}`);
      if (!target) return;

      const dotRect = dot.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // Source: center of the dot
      const x1 = dotRect.left + dotRect.width / 2 - containerRect.left + container.scrollLeft;
      const y1 = dotRect.top + dotRect.height / 2 - containerRect.top + container.scrollTop;

      // Target: left-center of the heap card
      const x2 = targetRect.left - containerRect.left + container.scrollLeft;
      const y2 = targetRect.top + targetRect.height / 2 - containerRect.top + container.scrollTop;

      arrows.push({ id: heapId, x1, y1, x2, y2 });
    });

    return arrows;
  }, [containerRef]);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    // Size the SVG to cover the full scrollable area
    svg.setAttribute('width', String(container.scrollWidth));
    svg.setAttribute('height', String(container.scrollHeight));

    const arrows = computeArrows();

    // Build SVG content (defs + paths)
    const paths = arrows.map((a, i) => {
      // Quadratic bezier curving to the right
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const cx = a.x1 + dx * 0.5 + Math.abs(dy) * 0.15;
      const cy = a.y1 + dy * 0.5;

      return `<path
        d="M${a.x1},${a.y1} Q${cx},${cy} ${a.x2},${a.y2}"
        class="pointer-arrow"
        marker-end="url(#arrowhead)"
        data-heap="${a.id}"
        key="${i}"
      />`;
    }).join('');

    svg.innerHTML = `
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <polygon points="0 0, 8 3, 0 6" fill="#0d6efd" />
        </marker>
      </defs>
      ${paths}
    `;
  }, [computeArrows, containerRef]);

  // RAF-gated redraw: deduplicates scroll, resize, and mutation events
  // so at most one draw() runs per animation frame.
  const scheduleRedraw = useCallback(() => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    // Redraw after a microtask so DOM layout is settled
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw, currentStep, snapshots]);

  // Redraw on resize, scroll, and DOM mutations (e.g. heap filter toggling cards)
  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    window.addEventListener('resize', scheduleRedraw);
    container?.addEventListener('scroll', scheduleRedraw, { passive: true });

    let observer: MutationObserver | undefined;
    if (container) {
      observer = new MutationObserver((mutations) => {
        // Ignore mutations inside our own SVG to prevent an infinite loop
        // (draw sets innerHTML which triggers MutationObserver)
        if (svg && mutations.every((m) => svg.contains(m.target))) return;
        scheduleRedraw();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    // Redraw when the container is resized (e.g. pane divider drag)
    let resizeObs: ResizeObserver | undefined;
    if (container) {
      resizeObs = new ResizeObserver(scheduleRedraw);
      resizeObs.observe(container);
    }

    return () => {
      window.removeEventListener('resize', scheduleRedraw);
      container?.removeEventListener('scroll', scheduleRedraw);
      observer?.disconnect();
      resizeObs?.disconnect();
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
    };
  }, [scheduleRedraw, containerRef]);

  return (
    <svg
      ref={svgRef}
      className="pointer-arrows-svg"
    />
  );
});
