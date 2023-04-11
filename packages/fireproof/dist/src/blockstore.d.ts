/**
 * @typedef {Object} AnyBlock
 * @property {import('./link').AnyLink} cid - The CID of the block
 * @property {Uint8Array} bytes - The block's data
 *
 * @typedef {Object} Blockstore
 * @property {function(import('./link').AnyLink): Promise<AnyBlock|undefined>} get - A function to retrieve a block by CID
 * @property {function(import('./link').AnyLink, Uint8Array): Promise<void>} put - A function to store a block's data and CID
 *
 * A blockstore that caches writes to a transaction and only persists them when committed.
 * @implements {Blockstore}
 */
export class TransactionBlockstore implements Blockstore {
    constructor(name: any, encryptionKey: any);
    /** @type {Map<string, Uint8Array>} */
    committedBlocks: Map<string, Uint8Array>;
    valet: any;
    instanceId: string;
    inflightTransactions: Set<any>;
    /**
     * Get a block from the store.
     *
     * @param {import('./link').AnyLink} cid
     * @returns {Promise<AnyBlock | undefined>}
     */
    get(cid: import('./link').AnyLink): Promise<AnyBlock | undefined>;
    transactionsGet(key: any): Promise<any>;
    committedGet(key: any): Promise<any>;
    clearCommittedCache(): Promise<void>;
    networkGet(key: any): Promise<any>;
    /**
     * Add a block to the store. Usually bound to a transaction by a closure.
     * It sets the lastCid property to the CID of the block that was put.
     * This is used by the transaction as the head of the car when written to the valet.
     * We don't have to worry about which transaction we are when we are here because
     * we are the transactionBlockstore.
     *
     * @param {import('./link').AnyLink} cid
     * @param {Uint8Array} bytes
     */
    put(cid: import('./link').AnyLink, bytes: Uint8Array): void;
    /**
     * Iterate over all blocks in the store.
     *
     * @yields {AnyBlock}
     * @returns {AsyncGenerator<AnyBlock>}
     */
    /**
     * Begin a transaction. Ensures the uncommited blocks are empty at the begining.
     * Returns the blocks to read and write during the transaction.
     * @returns {InnerBlockstore}
     * @memberof TransactionBlockstore
     */
    begin(label?: string): InnerBlockstore;
    /**
     * Commit the transaction. Writes the blocks to the store.
     * @returns {Promise<void>}
     * @memberof TransactionBlockstore
     */
    commit(innerBlockstore: any): Promise<void>;
    doCommit: (innerBlockstore: any) => Promise<void>;
    /**
     * Retire the transaction. Clears the uncommited blocks.
     * @returns {void}
     * @memberof TransactionBlockstore
     */
    retire(innerBlockstore: any): void;
}
export function doTransaction(label: string, blockstore: TransactionBlockstore, doFun: (innerBlockstore: Blockstore) => Promise<any>): Promise<any>;
/** @implements {BlockFetcher} */
export class InnerBlockstore implements BlockFetcher {
    constructor(label: any, parentBlockstore: any);
    /** @type {Map<string, Uint8Array>} */
    blocks: Map<string, Uint8Array>;
    lastCid: any;
    label: string;
    parentBlockstore: any;
    /**
     * @param {import('./link').AnyLink} cid
     * @returns {Promise<AnyBlock | undefined>}
     */
    get(cid: import('./link').AnyLink): Promise<AnyBlock | undefined>;
    /**
     * @param {import('./link').AnyLink} cid
     * @param {Uint8Array} bytes
     */
    put(cid: import('./link').AnyLink, bytes: Uint8Array): void;
    entries(): Generator<{
        cid: import("multiformats").Link<unknown, number, number, import("multiformats").Version>;
        bytes: Uint8Array;
    }, void, unknown>;
}
export type AnyBlock = {
    /**
     * - The CID of the block
     */
    cid: import('./link').AnyLink;
    /**
     * - The block's data
     */
    bytes: Uint8Array;
};
export type Blockstore = {
    /**
     * - A function to retrieve a block by CID
     */
    get: (arg0: import('./link').AnyLink) => Promise<AnyBlock | undefined>;
    /**
     * - A function to store a block's data and CID
     *
     * A blockstore that caches writes to a transaction and only persists them when committed.
     */
    put: (arg0: import('./link').AnyLink, arg1: Uint8Array) => Promise<void>;
};
//# sourceMappingURL=blockstore.d.ts.map