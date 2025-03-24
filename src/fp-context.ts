/*
 * Context class to store and retrieve values
 * it's used to store user runtime values like
 * the url to the ledger
 */

export function isFPContext(ctx: unknown): ctx is FPContext {
  return ctx instanceof FPContext && "ctx" in ctx && ctx.ctx instanceof Map;
}
export class FPContext {
  ctx = new Map<string, unknown>();

  static merge(...ctxs: (FPContext | undefined | Record<string, unknown>)[]): FPContext {
    const merged = new FPContext();
    for (const ctx of ctxs) {
      if (!ctx) continue;
      let entries: [string, unknown][] = [];
      if (isFPContext(ctx)) {
        entries = Array.from(ctx.ctx.entries());
      } else if (typeof ctx === "object" && ctx !== null) {
        entries = Object.entries(ctx);
      }
      for (const [key, value] of entries) {
        merged.ctx.set(key, value);
      }
    }
    return merged;
  }

  set<T>(key: string, value: T): FPContext {
    this.ctx.set(key, value);
    return this;
  }
  get<T>(key: string): T | undefined {
    return this.ctx.get(key) as T;
  }
  delete(key: string): void {
    this.ctx.delete(key);
  }
}
