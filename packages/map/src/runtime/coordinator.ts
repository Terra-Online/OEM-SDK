import { withOEMAbort } from '@opendfieldmap/core';

/** Serializes commands; rejection/abort never poisons later work. */
export class UpdateCoordinator {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;
  get busy(): boolean { return this.depth > 0; }
  constructor(private lifetime: AbortSignal, private assertAlive: () => void, private settled: () => void) {}
  run<T>(operation: (signal: AbortSignal) => T | Promise<T>, external?: AbortSignal): Promise<T> {
    const signal = external ? AbortSignal.any([this.lifetime, external]) : this.lifetime;
    const result = this.tail.then(async () => {
      signal.throwIfAborted(); this.assertAlive(); this.depth++;
      try { return await operation(signal); }
      finally { this.depth--; if (!this.lifetime.aborted) this.settled(); }
    });
    this.tail = result.catch(() => undefined);
    return withOEMAbort(result, signal);
  }
}
