export function encrypt({ get, cids, hasher, key, cache, chunker, root }: {
    get: any;
    cids: any;
    hasher: any;
    key: any;
    cache: any;
    chunker: any;
    root: any;
}): AsyncGenerator<any, void, unknown>;
export function decrypt({ root, get, key, cache, chunker, hasher }: {
    root: any;
    get: any;
    key: any;
    cache: any;
    chunker: any;
    hasher: any;
}): AsyncGenerator<any, void, undefined>;
//# sourceMappingURL=crypto.d.ts.map