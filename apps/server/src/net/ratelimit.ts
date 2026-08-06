export class TokenBucket {
  #tokens: number;
  #lastRefillMs = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.#tokens = capacity;
  }

  tryConsume(nowMs: number): boolean {
    const elapsedSec = Math.max(0, nowMs - this.#lastRefillMs) / 1000;
    this.#tokens = Math.min(this.capacity, this.#tokens + elapsedSec * this.refillPerSec);
    this.#lastRefillMs = nowMs;

    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
