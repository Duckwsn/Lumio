import assert from "node:assert/strict";
import test from "node:test";
import { normalizedPoint, paintBoard, paintStroke } from "./drawing";
test("normalized coordinates preserve geometry across mobile, desktop, resize and clamp", () => {
  for (const width of [320, 360, 375, 390, 412, 430, 800]) assert.deepEqual(normalizedPoint(10 + width / 2, 20 + width * .75 / 4, { left: 10, top: 20, width, height: width * .75 }), { x: .5, y: .25 });
  assert.deepEqual(normalizedPoint(-10, 900, { left: 0, top: 0, width: 400, height: 300 }), { x: 0, y: 1 });
});
test("brush interpolation, eraser and snapshot reconstruction use logical board geometry", () => {
  const calls: unknown[][] = [];
  const ctx = { beginPath() {}, arc(...args: unknown[]) { calls.push(["arc", ...args]); }, fill() {}, fillRect(...args: unknown[]) { calls.push(["fillRect", ...args]); }, moveTo(...args: unknown[]) { calls.push(["moveTo", ...args]); }, lineTo(...args: unknown[]) { calls.push(["lineTo", ...args]); }, stroke() {} } as unknown as CanvasRenderingContext2D;
  const stroke = { id: "s", tool: "brush" as const, color: "#26332c", width: .01, points: [{ x: .25, y: .25 }, { x: .5, y: .5 }, { x: .75, y: .75 }] };
  paintStroke(ctx, stroke, 2); assert.deepEqual(calls, [["moveTo", 400, 300], ["lineTo", 600, 450]]); assert.equal(ctx.lineWidth, 8);
  paintStroke(ctx, { ...stroke, tool: "eraser" }); assert.equal(ctx.strokeStyle, "#faf8ef");
  calls.length = 0; paintBoard(ctx, [stroke]); assert.deepEqual(calls[0], ["fillRect", 0, 0, 800, 600]); assert.equal(ctx.strokeStyle, stroke.color);
  paintStroke(ctx, { ...stroke, points: [stroke.points[0]] }); assert.equal(calls.at(-1)![0], "arc");
});
