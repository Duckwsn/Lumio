import assert from "node:assert/strict";
import test from "node:test";
import type { OAuth2Client } from "google-auth-library";
import { GoogleIdentityService } from "./googleIdentity.js";

test("Google identity requires verified email and matching nonce after official token verification", async () => {
  let audience = "";
  const verifier = { verifyIdToken: async (input: { audience: string }) => {
    audience = input.audience;
    return { getPayload: () => ({ sub: "stable-google-sub", email: "duck@example.test", email_verified: true, nonce: "fresh-nonce", name: "Duck", picture: "https://example.test/avatar" }) };
  } } as unknown as Pick<OAuth2Client, "verifyIdToken">;
  const service = new GoogleIdentityService("public-client-id", verifier);
  const identity = await service.verify("signed-id-token", "fresh-nonce");
  assert.equal(audience, "public-client-id");
  assert.equal(identity.sub, "stable-google-sub");
  await assert.rejects(() => service.verify("signed-id-token", "wrong-nonce"));
});

test("Google identity refuses unverified email even with valid subject", async () => {
  const verifier = { verifyIdToken: async () => ({ getPayload: () => ({ sub: "stable-google-sub", email: "duck@example.test", email_verified: false, nonce: "fresh-nonce" }) }) } as unknown as Pick<OAuth2Client, "verifyIdToken">;
  await assert.rejects(() => new GoogleIdentityService("public-client-id", verifier).verify("signed-id-token", "fresh-nonce"));
});
