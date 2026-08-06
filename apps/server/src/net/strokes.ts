/**
 * Keeps the current turn's stroke frames so a late joiner or a reconnecting
 * player can replay the canvas instead of seeing it blank.
 */
export class StrokeRelay {
  #frames: Uint8Array[] = [];

  constructor(private readonly maxFrames = 4_000) {}

  append(frame: Uint8Array): void {
    this.#frames.push(frame);
    if (this.#frames.length > this.maxFrames) {
      this.#frames = this.#frames.slice(this.#frames.length - this.maxFrames);
    }
  }

  /** Removes the most recent frame. Returns the resulting frame count. */
  undo(): number {
    this.#frames.pop();
    return this.#frames.length;
  }

  clear(): void {
    this.#frames = [];
  }

  log(): Uint8Array[] {
    return this.#frames;
  }
}
