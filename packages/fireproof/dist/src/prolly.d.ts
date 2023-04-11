/**
 * Put a value (a CID) for the given key. If the key exists it's value is overwritten.
 *
 * @param {import('./blockstore.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to put.
 * @param {CID} value The value to put.
 * @param {object} [options]
 * @returns {Promise<Result>}
 */
export function put(inBlocks: any, head: import('./clock').EventLink<EventData>[], event: any, options?: object): Promise<Result>;
/**
 * Determine the effective prolly root given the current merkle clock head.
 *
 * @param {import('./blockstore.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 */
export function root(inBlocks: any, head: import('./clock').EventLink<EventData>[]): Promise<{
    cids: any;
    node: any;
}>;
/**
 * Get the list of events not known by the `since` event
 * @param {import('./blockstore.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {import('./clock').EventLink<EventData>} since Event to compare against.
 * @returns {Promise<{clockCIDs: CIDCounter, result: EventData[]}>}
 */
export function eventsSince(blocks: any, head: import('./clock').EventLink<EventData>[], since: import('./clock').EventLink<EventData>): Promise<{
    clockCIDs: CIDCounter;
    result: EventData[];
}>;
/**
 *
 * @param {import('./blockstore.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 *
 * @returns {Promise<{clockCIDs: CIDCounter, result: EventData[]}>}
 *
 */
export function getAll(blocks: any, head: import('./clock').EventLink<EventData>[]): Promise<{
    clockCIDs: CIDCounter;
    result: EventData[];
}>;
/**
 * @param {import('./blockstore.js').BlockFetcher} blocks Bucket block storage.
 * @param {import('./clock').EventLink<EventData>[]} head Merkle clock head.
 * @param {string} key The key of the value to retrieve.
 */
export function get(blocks: any, head: import('./clock').EventLink<EventData>[], key: string): Promise<{
    cids: any;
    result: any;
    clockCIDs?: undefined;
} | {
    result: any;
    cids: any;
    clockCIDs: any;
}>;
export function vis(blocks: any, head: any): AsyncGenerator<any, {
    cids: any;
    result: any;
    vis?: undefined;
} | {
    vis: string;
    cids: any;
    result?: undefined;
}, unknown>;
export function visMerkleTree(blocks: any, head: any): Promise<{
    cids: any;
    result: any;
    vis?: undefined;
} | {
    vis: string;
    cids: any;
    result?: undefined;
}>;
export function visMerkleClock(blocks: any, head: any): Promise<{
    vis: string;
}>;
export function makeGetBlock(blocks: any): {
    getBlock: (address: any) => Promise<import("multiformats").BlockView<unknown, 113, 18, import("multiformats").Version>>;
};
//# sourceMappingURL=prolly.d.ts.map