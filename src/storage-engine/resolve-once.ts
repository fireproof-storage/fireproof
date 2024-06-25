import { Future } from "@adviser/cement";

export class ResolveOnce<T> {
    _onceDone = false;
    readonly _onceFutures: Future<T>[] = [];
    _once?: T

    async once(fn: () => Promise<T>): Promise<T> {
        if (this._onceDone) return this._once as T;
        const future = new Future<T>();
        this._onceFutures.push(future);
        if (this._onceFutures.length > 1) {
            return future.asPromise();
        }
        this._once = await fn()
        this._onceDone = true;
        this._onceFutures.slice(1).forEach((f) => f.resolve(this._once as T));
        this._onceFutures.length = 0;
        return this._once;
    }
}