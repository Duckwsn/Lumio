import assert from "node:assert/strict";
import test from "node:test";
import { BoundedRateLimiter } from "./boundedRateLimiter.js";

test("bounded limiter evicts cold identities without globally locking out new clients", () => {
  const limiter = new BoundedRateLimiter(2);
  assert.equal(limiter.consume("active", 2, 60_000, 0), true);
  assert.equal(limiter.consume("cold", 1, 60_000, 0), true);
  assert.equal(limiter.consume("active", 2, 60_000, 1), true);
  assert.equal(limiter.consume("new", 1, 60_000, 1), true);
  assert.equal(limiter.size, 2);
  assert.equal(limiter.consume("active", 2, 60_000, 2), false);
  assert.equal(limiter.consume("another-new-client", 1, 60_000, 2), true);
  assert.equal(limiter.size, 2);
});

test("bounded limiter resets a bucket after its window expires", () => {
  const limiter = new BoundedRateLimiter(4);
  assert.equal(limiter.consume("client", 1, 1_000, 0), true);
  assert.equal(limiter.consume("client", 1, 1_000, 500), false);
  assert.equal(limiter.consume("client", 1, 1_000, 1_000), true);
});
