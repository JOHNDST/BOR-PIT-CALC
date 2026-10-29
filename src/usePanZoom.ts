import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanZoom {
  zoom: number;
  /** content offset in screen pixels */
  x: number;
  y: number;
}

interface Options {
  min: number;
  max: number;
  /** content point (at pan 0) that zooming scales about */
  origin: { x: number; y: number };
}

const DRAG_THRESHOLD = 4;

/**
 * Drag to pan, wheel / pinch to zoom about the pointer. A drag never turns into a click,
 * so corners and cells underneath keep working with plain clicks.
 */
export function usePanZoom(ref: React.RefObject<HTMLElement | null>, options: Options) {
  const [view, setView] = useState<PanZoom>({ zoom: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const opts = useRef(options);
  opts.current = options;
  const viewRef = useRef(view);
  viewRef.current = view;

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setView((v) => {
      const { min, max, origin } = opts.current;
      const zoom = Math.min(max, Math.max(min, v.zoom * factor));
      const r = zoom / v.zoom;
      const dx = sx - origin.x;
      const dy = sy - origin.y;
      return { zoom, x: Math.round(dx - (dx - v.x) * r), y: Math.round(dy - (dy - v.y) * r) };
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; vx: number; vy: number } | null = null;
    let panning = false;
    let suppressClick = false;
    let pinchDist = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pair = () => [...pts.values()];
    const restart = () => {
      const [p] = pair();
      start = p ? { x: p.x, y: p.y, vx: viewRef.current.x, vy: viewRef.current.y } : null;
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as Element).closest('.no-pan')) return;
      suppressClick = false;
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) {
        panning = false;
        restart();
      } else if (pts.size === 2) {
        const [a, b] = pair();
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        panning = true;
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size >= 2) {
        const [a, b] = pair();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoomAt(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = d;
        return;
      }
      if (!start) return;
      if (!panning && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_THRESHOLD) {
        panning = true;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
      }
      if (panning) {
        const s = start;
        setView((v) => ({ ...v, x: Math.round(s.vx + p.x - s.x), y: Math.round(s.vy + p.y - s.y) }));
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (panning) suppressClick = true;
      if (pts.size === 0) {
        start = null;
        panning = false;
        setDragging(false);
      } else {
        restart();
      }
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.no-pan')) return;
      e.preventDefault();
      const p = local(e);
      const step = e.deltaMode === 1 ? 0.05 : 0.0015;
      zoomAt(Math.exp(-e.deltaY * step), p.x, p.y);
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
    };
  }, [ref, zoomAt]);

  return { view, setView, zoomAt, dragging };
}
