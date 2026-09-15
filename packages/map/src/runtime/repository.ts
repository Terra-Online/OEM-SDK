/** Instance-local resolved data and in-flight work; loaders retain their data contracts. */
export class ResourceRepository {
  private values = new Map<string, unknown>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private signal: AbortSignal) {}
  peek<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    this.signal.throwIfAborted();
    if (this.values.has(key)) return Promise.resolve(this.values.get(key) as T);
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = loader().then(value => {
      this.signal.throwIfAborted(); this.values.set(key, value); return value;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request); return request;
  }
  clear(): void { this.pending.clear(); this.values.clear(); }
}
