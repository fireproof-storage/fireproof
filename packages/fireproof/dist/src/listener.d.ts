/**
 * A Fireproof database Listener allows you to react to events in the database.
 *
 * @class Listener
 * @classdesc An listener attaches to a Fireproof database and runs a routing function on each change, sending the results to subscribers.
 *
 * @param {Fireproof} database - The Fireproof database instance to index.
 * @param {Function} routingFn - The routing function to apply to each entry in the database.
 */
export class Listener {
    constructor(database: any, routingFn: any);
    subcribers: Map<any, any>;
    doStopListening: any;
    /** routingFn
     * The database instance to index.
     * @type {Fireproof}
     */
    database: Fireproof;
    /**
     * The map function to apply to each entry in the database.
     * @type {Function}
     */
    routingFn: Function;
    dbHead: any;
    /**
     * Subscribe to a topic emitted by the event function.
     * @param {string} topic - The topic to subscribe to.
     * @param {Function} subscriber - The function to call when the topic is emitted.
     * @returns {Function} A function to unsubscribe from the topic.
     * @memberof Listener
     * @instance
     */
    on(topic: string, subscriber: Function, since: any): Function;
    onChanges(changes: any): void;
}
//# sourceMappingURL=listener.d.ts.map