export type LoopCallbacks = {
  update: (dtMs: number) => void;
  render: () => void;
};

export class GameLoop {
  private callbacks: LoopCallbacks;
  private fixedStepMs: number;
  private accumulatorMs = 0;
  private lastTime = 0;
  private rafId: number | null = null;
  private running = false;

  constructor(callbacks: LoopCallbacks, fixedStepMs = 1000 / 60) {
    this.callbacks = callbacks;
    this.fixedStepMs = fixedStepMs;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      let frameMs = now - this.lastTime;
      if (frameMs > 1000) frameMs = this.fixedStepMs; // tab restore guard
      this.lastTime = now;
      this.accumulatorMs += frameMs;
      while (this.accumulatorMs >= this.fixedStepMs) {
        this.callbacks.update(this.fixedStepMs);
        this.accumulatorMs -= this.fixedStepMs;
      }
      this.callbacks.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
