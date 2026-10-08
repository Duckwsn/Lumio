type AttemptWindow = { count: number; resetAt: number };

/** A process-local sliding window whose LRU buckets keep memory bounded without
 * turning capacity pressure into a global outage. Production ingress should
 * still enforce shared limits when the service runs more than one instance. */
export class BoundedRateLimiter {
  private readonly buckets = new Map<string, AttemptWindow>();

  constructor(private readonly maxBuckets = 20_000) {
    if (!Number.isInteger(maxBuckets) || maxBuckets < 1) throw new Error("maxBuckets must be a positive integer.");
  }

  consume(key: string, ceiling: number, windowMs: number, now = Date.now()) {
    const prior = this.buckets.get(key);
    const next = prior && prior.resetAt > now
      ? { count: prior.count + 1, resetAt: prior.resetAt }
      : { count: 1, resetAt: now + windowMs };

    // Refresh active keys so a hot client's bucket survives eviction of cold
    // identities when the bounded map is full.
    this.buckets.delete(key);
    this.buckets.set(key, next);
    while (this.buckets.size > this.maxBuckets) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }

    return next.count <= ceiling;
  }

  get size() { return this.buckets.size; }
}
