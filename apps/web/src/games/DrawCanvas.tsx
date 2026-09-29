import { useEffect, useRef, useState } from "react";
import { drawColors, type DrawSnapshot, type DrawStroke, type DrawDelta, type GameAction, type GameAck, type ServerToClientEvents, type ClientToServerEvents } from "@lumio/shared";
import type { Socket } from "socket.io-client";
import { BOARD_HEIGHT, BOARD_WIDTH, normalizedPoint, paintBoard, paintStroke } from "./drawing";
import { Brush, Eraser, Undo2, Trash2 } from "lucide-react";
import { isDrawingUndo } from "./drawingShortcut";

export function DrawCanvas({ snapshot, socket, enabled, act }: { snapshot: DrawSnapshot; socket: Socket<ServerToClientEvents, ClientToServerEvents>; enabled: boolean; act: (action: GameAction, callback?: (ack: GameAck) => void) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const board = useRef<DrawStroke[]>([]), boardRevision = useRef(0);
  const boardIdentity = useRef("");
  const active = useRef<{ stroke: DrawStroke; sent: number; pointer: number } | null>(null);
  const [tool, setTool] = useState<"brush" | "eraser">("brush"), [color, setColor] = useState<(typeof drawColors)[number]>(drawColors[0]), [width, setWidth] = useState(.012);
  const latest = useRef({ snapshot, act, enabled }); latest.current = { snapshot, act, enabled };
  const [confirmClear, setConfirmClear] = useState(false);
  const clearBox = useRef<HTMLDivElement>(null);
  const payload = () => { const s = latest.current.snapshot; return { roomId: s.roomId, sessionId: s.sessionId, roundId: s.roundId, revision: s.revision }; };
  const resync = () => latest.current.act({ ...payload(), type: "sync" });
  const flush = () => {
    const a = active.current; if (!a || a.sent >= a.stroke.points.length || !latest.current.enabled) return;
    while (a.sent < a.stroke.points.length) {
      const offset = a.sent, points = a.stroke.points.slice(offset, offset + 32); a.sent += points.length;
      latest.current.act({ ...payload(), type: "stroke", strokeId: a.stroke.id, offset, points, tool: a.stroke.tool, color: a.stroke.color as (typeof drawColors)[number], width: a.stroke.width }, (ack) => { if (!ack.ok) { active.current = null; resync(); } });
    }
  };
  const undo = () => { flush(); active.current = null; latest.current.act({ ...payload(), type: "undo" }, (ack) => { if (!ack.ok) resync(); }); };
  const undoRef = useRef(undo); undoRef.current = undo;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = Boolean(target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
      const overlay = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], .main-menu-popover, .profile-popover, .mobile-call-menu, .party-drawer:not(.is-chat)'));
      if (!isDrawingUndo(event, latest.current.enabled, editing, overlay)) return;
      event.preventDefault(); undoRef.current();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => { setConfirmClear(false); }, [snapshot.roundId, enabled]);
  useEffect(() => { if (confirmClear) clearBox.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [confirmClear]);
  useEffect(() => {
    const identity = `${snapshot.sessionId}:${snapshot.roundId}`;
    if (boardIdentity.current === identity && boardRevision.current === snapshot.boardRevision) return;
    boardIdentity.current = identity;
    active.current = null;
    board.current = structuredClone(snapshot.strokes); boardRevision.current = snapshot.boardRevision;
    const ctx = canvas.current?.getContext("2d"); if (ctx) paintBoard(ctx, board.current);
  }, [snapshot.sessionId, snapshot.roundId, snapshot.boardRevision, snapshot.strokes]);
  useEffect(() => {
    const receive = (delta: DrawDelta) => {
      const s = latest.current.snapshot;
      if (delta.sessionId !== s.sessionId || delta.roundId !== s.roundId || delta.boardRevision <= boardRevision.current) return;
      if (delta.boardRevision !== boardRevision.current + 1) { resync(); return; }
      let stroke = board.current.find((entry) => entry.id === delta.stroke.id);
      if (stroke && stroke.points.length >= delta.offset + delta.stroke.points.length) { boardRevision.current = delta.boardRevision; return; } // local optimistic echo
      if (!stroke) { if (delta.offset !== 0) { resync(); return; } stroke = { ...delta.stroke, points: [] }; board.current.push(stroke); }
      if (stroke.points.length !== delta.offset) { resync(); return; }
      stroke.points.push(...delta.stroke.points); boardRevision.current = delta.boardRevision;
      const ctx = canvas.current?.getContext("2d"); if (ctx) paintStroke(ctx, stroke, delta.offset);
    };
    socket.on("game:draw", receive);
    const timer = window.setInterval(flush, 50);
    return () => { window.clearInterval(timer); socket.off("game:draw", receive); active.current = null; };
  }, [socket]);
  useEffect(() => { if (!enabled) active.current = null; }, [enabled]);
  return <div className="draw-board">
    <canvas ref={canvas} tabIndex={enabled ? 0 : -1} width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label={enabled ? "Tela de desenho — desenhe com mouse, toque ou caneta" : "Desenho compartilhado da rodada"} data-board-revision={snapshot.boardRevision}
      onPointerDown={(event) => {
        if (!enabled || active.current || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        const stroke: DrawStroke = { id: crypto.randomUUID(), tool, color, width, points: [normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())] };
        board.current.push(stroke); active.current = { stroke, sent: 0, pointer: event.pointerId }; const ctx = event.currentTarget.getContext("2d"); if (ctx) paintStroke(ctx, stroke);
      }} onPointerMove={(event) => {
        const a = active.current; if (!enabled || !a || a.pointer !== event.pointerId || a.stroke.points.length >= 512) return;
        event.preventDefault(); const offset = a.stroke.points.length; a.stroke.points.push(normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()));
        const ctx = event.currentTarget.getContext("2d"); if (ctx) paintStroke(ctx, a.stroke, offset);
        if (a.stroke.points.length - a.sent >= 32) flush();
      }} onPointerUp={(event) => { if (active.current?.pointer !== event.pointerId) return; flush(); active.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { if (active.current?.pointer !== event.pointerId) return; flush(); active.current = null; }} />
    {enabled ? <div className="draw-toolbar" role="group" aria-label="Ferramentas de desenho">
      <div className="draw-tool-group"><button aria-label="Pincel" title="Pincel" aria-pressed={tool === "brush"} onClick={() => setTool("brush")}><Brush size={18} /></button><button aria-label="Borracha" title="Borracha" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}><Eraser size={18} /></button></div>
      <div className="draw-colors">{drawColors.map((value, index) => <button key={value} style={{ background: value }} aria-label={`Cor ${["grafite", "marfim", "verde", "vermelho", "amarelo", "azul", "violeta"][index]}`} aria-pressed={color === value} onClick={() => { setColor(value); setTool("brush"); }}>{color === value ? "✓" : ""}</button>)}</div>
      <label><span>Espessura</span><select aria-label="Espessura" value={width} onChange={(e) => setWidth(Number(e.target.value))}><option value={.006}>Fina</option><option value={.012}>Média</option><option value={.025}>Grossa</option></select></label>
      <div className="draw-tool-group draw-history"><button aria-label="Desfazer" title="Desfazer (Ctrl/Cmd+Z)" onClick={undo}><Undo2 size={18} /><span>Desfazer</span></button><button aria-label="Limpar tela" title="Limpar tela" onClick={() => setConfirmClear(true)}><Trash2 size={18} /></button></div>
      {confirmClear ? <div ref={clearBox} className="draw-clear-confirm" role="alertdialog" aria-label="Limpar todo o desenho?" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setConfirmClear(false); } }}><span>Limpar todo o desenho?</span><button onClick={() => setConfirmClear(false)}>Cancelar</button><button onClick={() => { active.current = null; act({ ...payload(), type: "clear" }, (ack) => { if (!ack.ok) resync(); }); setConfirmClear(false); }}>Confirmar limpeza</button></div> : null}
    </div> : null}
  </div>;
}
