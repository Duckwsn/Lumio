import { useEffect, useRef, useState } from "react";
import { drawColors, type DrawSnapshot, type DrawStroke, type DrawDelta, type GameAction, type GameAck, type ServerToClientEvents, type ClientToServerEvents } from "@lumio/shared";
import type { Socket } from "socket.io-client";
import { BOARD_HEIGHT, BOARD_WIDTH, normalizedPoint, paintBoard, paintStroke } from "./drawing";
import { Brush, Eraser, Undo2, Trash2 } from "lucide-react";
import { isDrawingUndo } from "./drawingShortcut";
import { GameStage } from "./GameDesignSystem";

export function DrawCanvas({ snapshot, socket, enabled, showToolbar = enabled, controlsDisabled = false, act }: { snapshot: DrawSnapshot; socket: Socket<ServerToClientEvents, ClientToServerEvents>; enabled: boolean; showToolbar?: boolean; controlsDisabled?: boolean; act: (action: GameAction, callback?: (ack: GameAck) => void) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const board = useRef<DrawStroke[]>([]), boardRevision = useRef(0);
  const boardIdentity = useRef("");
  const active = useRef<{ stroke: DrawStroke; sent: number; pointer: number } | null>(null);
  const [tool, setTool] = useState<"brush" | "eraser">("brush"), [color, setColor] = useState<(typeof drawColors)[number]>(drawColors[0]), [width, setWidth] = useState(.012);
  const latest = useRef({ snapshot, act, enabled }); latest.current = { snapshot, act, enabled };
  const [confirmClear, setConfirmClear] = useState(false), [clearing, setClearing] = useState(false);
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
  useEffect(() => { setConfirmClear(false); setClearing(false); }, [snapshot.roundId, enabled]);
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
  return <>
    <GameStage className={`draw-board ${enabled ? `draw-board-${tool}` : "draw-board-view"}`}>
    <canvas ref={canvas} tabIndex={enabled ? 0 : -1} width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label={enabled ? "Área de desenho — desenhe com mouse, toque ou caneta" : "Desenho compartilhado da rodada"} data-board-revision={snapshot.boardRevision}
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
    </GameStage>
    {showToolbar ? <div className="draw-toolbar" role="group" aria-label="Ferramentas de desenho">
      <div className="draw-tool-group draw-tool-choice" role="group" aria-label="Ferramenta"><button disabled={!enabled} aria-label="Pincel" title="Pincel" aria-pressed={tool === "brush"} onClick={() => setTool("brush")}><Brush size={18} /><span>Pincel</span></button><button disabled={!enabled} aria-label="Borracha" title="Borracha" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}><Eraser size={18} /><span>Borracha</span></button></div>
      <div className="draw-colors" role="group" aria-label="Cores do pincel">{drawColors.map((value, index) => <button key={value} type="button" disabled={!enabled} style={{ background: value }} aria-label={`Cor ${["grafite", "marfim", "verde", "vermelho", "amarelo", "azul", "violeta"][index]}`} title={["Grafite", "Marfim", "Verde", "Vermelho", "Amarelo", "Azul", "Violeta"][index]} aria-pressed={color === value && tool === "brush"} onClick={() => { setColor(value); setTool("brush"); }}>{color === value && tool === "brush" ? "✓" : ""}</button>)}</div>
      <label className="draw-size"><span>Espessura</span><select disabled={!enabled} aria-label="Espessura" value={width} onChange={(e) => setWidth(Number(e.target.value))}><option value={.006}>Fina</option><option value={.012}>Média</option><option value={.025}>Grossa</option></select><span className="draw-size-preview" aria-hidden="true" style={{ width: `${Math.max(5, width * 800)}px`, height: `${Math.max(5, width * 800)}px` }} /></label>
      <div className="draw-tool-group draw-history" role="group" aria-label="Histórico e limpeza"><button disabled={!enabled || controlsDisabled} aria-label="Desfazer" title="Desfazer (Ctrl/Cmd+Z)" onClick={undo}><Undo2 size={18} /><span>Desfazer</span></button><button className="draw-clear-trigger" disabled={!enabled || controlsDisabled} aria-label="Limpar tela" title="Limpar tela" onClick={() => setConfirmClear(true)}><Trash2 size={18} /><span>Limpar</span></button></div>
      {confirmClear ? <div ref={clearBox} className="draw-clear-confirm" role="alertdialog" aria-label="Limpar todo o desenho?" onKeyDown={(event) => { if (event.key === "Escape" && !clearing) { event.preventDefault(); event.stopPropagation(); setConfirmClear(false); } }}><span>Limpar todo o desenho?</span><button disabled={clearing} onClick={() => setConfirmClear(false)}>Cancelar</button><button disabled={clearing} onClick={() => { active.current = null; setClearing(true); act({ ...payload(), type: "clear" }, (ack) => { setClearing(false); if (ack.ok) setConfirmClear(false); else resync(); }); }}>{clearing ? "Limpando…" : "Confirmar limpeza"}</button></div> : null}
    </div> : null}
  </>;
}
