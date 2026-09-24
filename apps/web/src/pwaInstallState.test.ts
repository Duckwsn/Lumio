import assert from "node:assert/strict";
import test from "node:test";
import { resolvePwaInstallState } from "./pwaInstallState";

test("PWA install presentation never offers a dead install button", () => {
  assert.equal(resolvePwaInstallState(true, false, false), "available");
  assert.equal(resolvePwaInstallState(true, true, false), "installed");
  assert.equal(resolvePwaInstallState(false, true, false), "installed");
  assert.equal(resolvePwaInstallState(false, false, true), "ios");
  assert.equal(resolvePwaInstallState(false, false, false), "unsupported");
});
