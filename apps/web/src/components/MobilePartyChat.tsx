import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ListVideo, Plus, Users } from "lucide-react";

export function useMobileParty() {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const query = matchMedia("(max-width: 900px)"); const update = () => setMobile(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  return mobile;
}

export const chatSnapExpanded = (height: number, expanded: number, collapsed: number, velocity: number) =>
  Math.abs(velocity) > 0.35 ? velocity < 0 : height > (expanded + collapsed) / 2;

export function MobilePartyChat({ children, hidden, onPeople, onQueue, onAdd }: { children: ReactNode; hidden: boolean; onPeople: () => void; onQueue: () => void; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  const panel = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(true), limits = useRef({ expanded: 300, collapsed: 86 });
  const drag = useRef<{ pointer: number; y: number; height: number; lastY: number; time: number; velocity: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const snap = (value: boolean) => {
    expandedRef.current = value; setExpanded(value);
    if (panel.current) { panel.current.removeAttribute("data-dragging"); panel.current.style.height = `${value ? limits.current.expanded : limits.current.collapsed}px`; }
  };
  useEffect(() => {
    const workspace = panel.current?.parentElement; if (!workspace) return;
    const resize = () => {
      const height = workspace.clientHeight;
      const landscape = matchMedia("(orientation: landscape)").matches;
      limits.current.collapsed = landscape ? 44 : 86;
      limits.current.expanded = Math.max(landscape ? 110 : 160, Math.min(height * 0.55, height - 110));
      panel.current?.style.setProperty("--chat-min-height", `${limits.current.collapsed}px`);
      if (!drag.current && panel.current) panel.current.style.height = `${expandedRef.current ? limits.current.expanded : limits.current.collapsed}px`;
    };
    const observer = new ResizeObserver(resize); observer.observe(workspace); resize(); return () => observer.disconnect();
  }, [hidden]);
  useEffect(() => { if (body.current) body.current.inert = !expanded || hidden; }, [expanded, hidden]);
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    drag.current = null; suppressClick.current = current.moved;
    const height = panel.current?.getBoundingClientRect().height ?? current.height;
    const velocity = performance.now() - current.time > 120 ? 0 : current.velocity;
    snap(cancel || !current.moved ? expandedRef.current : chatSnapExpanded(height, limits.current.expanded, limits.current.collapsed, velocity));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section ref={panel} className={`mobile-party-chat ${expanded ? "expanded" : "collapsed"}`} hidden={hidden} aria-label="Chat da Party">
    <button className="chat-drag-handle" type="button" aria-label={expanded ? "Recolher chat" : "Expandir chat"} aria-expanded={expanded} aria-controls={id}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } snap(!expandedRef.current); }}
      onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); suppressClick.current = false; drag.current = { pointer: event.pointerId, y: event.clientY, height: panel.current!.getBoundingClientRect().height, lastY: event.clientY, time: performance.now(), velocity: 0, moved: false }; panel.current!.setAttribute("data-dragging", "true"); }}
      onPointerMove={(event) => { const current = drag.current; if (!current || current.pointer !== event.pointerId) return; const now = performance.now(); current.velocity = (event.clientY - current.lastY) / Math.max(1, now - current.time); current.lastY = event.clientY; current.time = now; current.moved ||= Math.abs(event.clientY - current.y) > 6; panel.current!.style.height = `${Math.max(limits.current.collapsed, Math.min(limits.current.expanded, current.height - (event.clientY - current.y)))}px`; }}
      onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}><span aria-hidden="true" /></button>
    <header className="mobile-chat-heading"><strong>Chat da Party</strong><div><button type="button" onClick={onPeople} aria-label="Pessoas da Party"><Users size={18} /></button><button type="button" onClick={onQueue} aria-label="Fila da Party"><ListVideo size={18} /></button><button type="button" onClick={onAdd} aria-label="Adicionar mídia"><Plus size={18} /></button></div></header>
    <div ref={body} id={id} className="mobile-chat-body" aria-hidden={!expanded || hidden}>{children}</div>
  </section>;
}
