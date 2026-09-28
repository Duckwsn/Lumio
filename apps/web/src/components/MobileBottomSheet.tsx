import { useEffect, useRef, type PointerEvent } from "react";

export const shouldDismissSheet = (distance: number, height: number, velocity: number) =>
  distance > 8 && (velocity > 0.35 || distance > height * 0.3);

// The handle moves its existing drawer, not the Party tree or the chat.
export function MobileSheetHandle({ onClose }: { onClose: () => void }) {
  const closing = useRef(false), closeTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const dismiss = (button: HTMLButtonElement) => {
    if (closing.current) return;
    closing.current = true;
    const sheet = button.closest<HTMLElement>(".party-drawer")!;
    sheet.style.transform = "translateY(100%)";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else closeTimer.current = window.setTimeout(onClose, 180);
  };
  const drag = useRef<{ id: number; start: number; last: number; time: number; velocity: number; distance: number } | null>(null);
  const suppressClick = useRef(false);
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current; if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    const sheet = event.currentTarget.closest<HTMLElement>(".party-drawer")!;
    suppressClick.current = current.distance > 6;
    const velocity = performance.now() - current.time > 120 ? 0 : current.velocity;
    sheet.removeAttribute("data-dragging"); sheet.style.transform = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && shouldDismissSheet(current.distance, sheet.offsetHeight, velocity)) dismiss(event.currentTarget);
  };
  return <button type="button" className="sheet-drag-handle" aria-label="Recolher painel da Party"
    onClick={(event) => { if (suppressClick.current) { suppressClick.current = false; return; } dismiss(event.currentTarget); }}
    onPointerDown={(event) => { if (closing.current || !event.isPrimary || event.button !== 0) return; const sheet = event.currentTarget.closest<HTMLElement>(".party-drawer")!; event.currentTarget.setPointerCapture(event.pointerId); suppressClick.current = false; drag.current = { id: event.pointerId, start: event.clientY, last: event.clientY, time: performance.now(), velocity: 0, distance: 0 }; sheet.setAttribute("data-dragging", "true"); }}
    onPointerMove={(event) => { const current = drag.current; if (!current || current.id !== event.pointerId) return; const now = performance.now(); current.velocity = (event.clientY - current.last) / Math.max(1, now - current.time); current.last = event.clientY; current.time = now; current.distance = Math.max(0, event.clientY - current.start); event.currentTarget.closest<HTMLElement>(".party-drawer")!.style.transform = `translateY(${current.distance}px)`; }}
    onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}><span aria-hidden="true" /></button>;
}
