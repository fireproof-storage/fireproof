export function cidsToProof(cids: any): Promise<any[]>;
/**
 * @class Fireproof
 * @classdesc Fireproof stores data in IndexedDB and provides a Merkle clock.
 *  This is the main class for saving and loading JSON and other documents with the database. You can find additional examples and
 *  usage guides in the repository README.
 *
 * @param {import('./blockstore.js').TransactionBlockstore} blocks - The block storage instance to use documents and indexes
 * @param {CID[]} clock - The Merkle clock head to use for the Fireproof instance.
 * @param {object} [config] - Optional configuration options for the Fireproof instance.
 * @param {object} [authCtx] - Optional authorization context object to use for any authentication checks.
 *
 */
export class Fireproof {
    /**
     * @function storage
     * @memberof Fireproof
     * Creates a new Fireproof instance with default storage settings
     * Most apps should use this and not worry about the details.
     * @static
     * @returns {Fireproof} - a new Fireproof instance
     */
    static storage: (name?: string) => Fireproof;
    constructor(blocks: any, clock: any, config: any, authCtx?: {});
    listeners: Set<any>;
    name: any;
    instanceId: string;
    blocks: any;
    clock: any;
    config: any;
    authCtx: {};
    indexes: Map<any, any>;
    /**
     * Renders the Fireproof instance as a JSON object.
     * @returns {Object} - The JSON representation of the Fireproof instance. Includes clock heads for the database and its indexes.
     * @memberof Fireproof
     * @instance
     */
    toJSON(): any;
    clockToJSON(): any;
    hydrate({ clock, name, key }: {
        clock: any;
        name: any;
        key: any;
    }): void;
    indexBlocks: any;
    /**
     * Triggers a notification to all listeners
     * of the Fireproof instance so they can repaint UI, etc.
     * @param {CID[] } clock
     *    Clock to use for the snapshot.
     * @returns {Promise<void>}
     * @memberof Fireproof
     * @instance
     */
    notifyReset(): Promise<void>;
    notifyExternal(source?: string): Promise<void>;
    /**
     * Returns the changes made to the Fireproof instance since the specified event.
     * @function changesSince
     * @param {CID[]} [event] - The clock head to retrieve changes since. If null or undefined, retrieves all changes.
     * @returns {Object<{rows : Object[], clock: CID[]}>} An object containing the rows and the head of the instance's clock.
     * @memberof Fireproof
     * @instance
     */
    changesSince(event?: CID[]): any;
    allDocuments(): Promise<{
        rows: {
            key: any;
            value: any;
        }[];
        clock: any;
        proof: any[];
    }>;
    /**
     * Runs validation on the specified document using the Fireproof instance's configuration. Throws an error if the document is invalid.
     *
     * @param {Object} doc - The document to validate.
     * @returns {Promise<void>}
     * @throws {Error} - Throws an error if the document is invalid.
     * @memberof Fireproof
     * @instance
     */
    runValidation(doc: any): Promise<void>;
    /**
     * Retrieves the document with the specified ID from the database
     *
     * @param {string} key - the ID of the document to retrieve
     * @param {Object} [opts] - options
     * @returns {Promise<{_id: string}>} - the document with the specified ID
     * @memberof Fireproof
     * @instance
     */
    get(key: string, opts?: any): Promise<{
        _id: string;
    }>;
    /**
     * Adds a new document to the database, or updates an existing document. Returns the ID of the document and the new clock head.
     *
     * @param {Object} doc - the document to be added
     * @param {string} doc._id - the document ID. If not provided, a random ID will be generated.
     * @param {CID[]} doc._clock - the document ID. If not provided, a random ID will be generated.
     * @param {Proof} doc._proof - CIDs referenced by the update
     * @returns {Promise<{ id: string, clock: CID[]  }>} - The result of adding the document to the database
     * @memberof Fireproof
     * @instance
     */
    put({ _id, _proof, ...doc }: {
        _id: string;
        _clock: CID[];
        _proof: Proof;
    }): Promise<{
        id: string;
        clock: CID[];
    }>;
    /**
     * Deletes a document from the database
     * @param {string | any} docOrId - the document ID
     * @returns {Promise<{ id: string, clock: CID[] }>} - The result of deleting the document from the database
     * @memberof Fireproof
     * @instance
     */
    del(docOrId: string | any): Promise<{
        id: string;
        clock: CID[];
    }>;
    /**
     * Updates the underlying storage with the specified event.
     * @private
     * @param {{del?: true, key : string, value?: any}} decodedEvent - the event to add
     * @returns {Promise<{ proof:{}, id: string, clock: CID[] }>} - The result of adding the event to storage
     */
    private putToProllyTree;
    vis(): AsyncGenerator<any, {
        cids: any;
        result: any;
        vis?: undefined;
    } | {
        vis: string;
        cids: any;
        result?: undefined;
    }, unknown>;
    visTree(): Promise<{
        cids: any;
        result: any;
        vis?: undefined;
    } | {
        vis: string;
        cids: any;
        result?: undefined;
    }>;
    visClock(): Promise<{
        vis: string;
    }>;
    /**
     * Registers a Listener to be called when the Fireproof instance's clock is updated.
     * Recieves live changes from the database after they are committed.
     * @param {Function} listener - The listener to be called when the clock is updated.
     * @returns {Function} - A function that can be called to unregister the listener.
     * @memberof Fireproof
     */
    registerListener(listener: Function): Function;
    notifyListeners(changes: any): Promise<void>;
    setCarUploader(carUploaderFn: any): void;
    setRemoteBlockReader(remoteBlockReaderFn: any): void;
}
//# sourceMappingURL=fireproof.d.ts.map