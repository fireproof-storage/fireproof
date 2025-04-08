/*
 * Context class to store and retrieve values
 * it's used to store user runtime values like
 * the url to the ledger
 */
export class FPContext {
  private ctx = new Map<string, unknown>();

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
