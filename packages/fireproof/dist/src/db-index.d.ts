/**
 * Represents an DbIndex for a Fireproof database.
 *
 * @class DbIndex
 * @classdesc An DbIndex can be used to order and filter the documents in a Fireproof database.
 *
 * @param {Fireproof} database - The Fireproof database instance to DbIndex.
 * @param {Function} mapFn - The map function to apply to each entry in the database.
 *
 */
export class DbIndex {
    static registerWithDatabase(inIndex: any, database: any): void;
    static fromJSON(database: any, { code, clock, name }: {
        code: any;
        clock: any;
        name: any;
    }): DbIndex;
    constructor(database: any, mapFn: any, clock: any, opts?: {});
    /**
     * The database instance to DbIndex.
     * @type {Fireproof}
     */
    database: Fireproof;
    mapFnString: any;
    mapFn: any;
    name: any;
    indexById: {
        root: any;
        cid: any;
    };
    indexByKey: {
        root: any;
        cid: any;
    };
    dbHead: any;
    instanceId: string;
    updateIndexPromise: Promise<void>;
    makeName(): any;
    toJSON(): {
        name: any;
        code: any;
        clock: {
            db: any;
            byId: any;
            byKey: any;
        };
    };
    /**
     * JSDoc for Query type.
     * @typedef {Object} DbQuery
     * @property {string[]} [range] - The range to query.
     * @memberof DbIndex
     */
    /**
     * Query object can have {range}
     * @param {DbQuery} query - the query range to use
     * @returns {Promise<{proof: {}, rows: Array<{id: string, key: string, value: any}>}>}
     * @memberof DbIndex
     * @instance
     */
    query(query: {
        /**
         * - The range to query.
         */
        range?: string[];
    }, update?: boolean): Promise<{
        proof: {};
        rows: Array<{
            id: string;
            key: string;
            value: any;
        }>;
    }>;
    /**
     * Update the DbIndex with the latest changes
     * @private
     * @returns {Promise<void>}
     */
    private updateIndex;
    innerUpdateIndex(inBlocks: any): Promise<void>;
}
/**
 * JDoc for the result row type.
 */
export type ChangeEvent = {
    /**
     * - The key of the document.
     */
    key: string;
    /**
     * - The new value of the document.
     */
    value: any;
    /**
     * - Is the row deleted?
     */
    del?: boolean;
};
/**
 * JDoc for the result row type.
 */
export type DbIndexEntry = {
    /**
     * - The key for the DbIndex entry.
     */
    key: string[];
    /**
     * - The value of the document.
     */
    value: any;
    /**
     * - Is the row deleted?
     */
    del?: boolean;
};
//# sourceMappingURL=db-index.d.ts.map