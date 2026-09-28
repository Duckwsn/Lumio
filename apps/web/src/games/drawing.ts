import type { DrawPoint, DrawStroke } from "@lumio/shared";
export const BOARD_WIDTH = 800, BOARD_HEIGHT = 600;
export function normalizedPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): DrawPoint {
  return { x: Math.min(1, Math.max(0, (x - rect.left) / Math.max(1, rect.width))), y: Math.min(1, Math.max(0, (y - rect.top) / Math.max(1, rect.height))) };
}
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke, offset = 0) {
  const points = stroke.points; if (!points.length) return;
  ctx.strokeStyle = stroke.tool === "eraser" ? "#faf8ef" : stroke.color; ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.width * BOARD_WIDTH; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (offset === 0) { ctx.beginPath(); ctx.arc(points[0].x * BOARD_WIDTH, points[0].y * BOARD_HEIGHT, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  // Identical raster operations for local samples, remote batches and reconstructed snapshots.
  // Pairwise linear interpolation retains continuity without batch-dependent joins/caps.
  for (let i = Math.max(1, offset); i < points.length; i++) {
    ctx.beginPath(); ctx.moveTo(points[i - 1].x * BOARD_WIDTH, points[i - 1].y * BOARD_HEIGHT);
    ctx.lineTo(points[i].x * BOARD_WIDTH, points[i].y * BOARD_HEIGHT); ctx.stroke();
  }
}
export function paintBoard(ctx: CanvasRenderingContext2D, strokes: DrawStroke[]) {
  ctx.fillStyle = "#faf8ef"; ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); strokes.forEach((stroke) => paintStroke(ctx, stroke));
}
