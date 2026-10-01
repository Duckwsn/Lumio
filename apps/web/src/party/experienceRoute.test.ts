import test from "node:test";
import assert from "node:assert/strict";
import { parsePartyRoute, partyPath } from "./experienceRoute.js";

test("GX3 canonical media and games routes encode House identity", () => {
  const id = "casa com espaço";
  assert.equal(partyPath(id, "media"), "/house/casa%20com%20espa%C3%A7o/media");
  assert.deepEqual(parsePartyRoute(partyPath(id, "games")), { kind: "party", houseId: id, experience: "games", legacy: false });
  assert.deepEqual(parsePartyRoute(`/house/${encodeURIComponent(id)}`), { kind: "party", houseId: id, experience: "media", legacy: true });
});

test("GX3 rejects invalid Party routes without joining arbitrary House IDs", () => {
  for (const path of ["/house/", "/house/a/unknown", "/house/a/media/extra", "/house/%ZZ/media", "/house/%2F/media"]) assert.deepEqual(parsePartyRoute(path), { kind: "invalid" });
  assert.equal(parsePartyRoute("/app"), null);
});
