/**
 * @template T
 * @typedef {{ parents: EventLink<T>[], data: T }} EventView
 */
/**
 * @template T
 * @typedef {import('multiformats').BlockView<EventView<T>>} EventBlockView
 */
/**
 * @template T
 * @typedef {import('multiformats').Link<EventView<T>>} EventLink
 */
/**
 * Advance the clock by adding an event.
 *
 * @template T
 * @param {import('./blockstore').BlockFetcher} blocks Block storage.
 * @param {EventLink<T>[]} head The head of the clock.
 * @param {EventLink<T>} event The event to add.
 * @returns {Promise<EventLink<T>[]>} The new head of the clock.
 */
export function advance<T>(blocks: any, head: import("multiformats/dist/types/src").Link<EventView<T>, number, number, 1>[], event: import("multiformats/dist/types/src").Link<EventView<T>, number, number, 1>): Promise<import("multiformats/dist/types/src").Link<EventView<T>, number, number, 1>[]>;
/**
 * @template T
 * @param {EventView<T>} value
 * @returns {Promise<EventBlockView<T>>}
 */
export function encodeEventBlock<T>(value: EventView<T>): Promise<import("multiformats/dist/types/src").BlockView<EventView<T>, number, number, 1>>;
/**
 * @template T
 * @param {Uint8Array} bytes
 * @returns {Promise<EventBlockView<T>>}
 */
export function decodeEventBlock<T>(bytes: Uint8Array): Promise<import("multiformats/dist/types/src").BlockView<EventView<T>, number, number, 1>>;
/**
 * @template T
 * @param {import('./blockstore').BlockFetcher} blocks Block storage.
 * @param {EventLink<T>[]} head
 * @param {object} [options]
 * @param {(b: EventBlockView<T>) => string} [options.renderNodeLabel]
 */
export function vis<T>(blocks: any, head: import("multiformats/dist/types/src").Link<EventView<T>, number, number, 1>[], options?: {
    renderNodeLabel?: (b: import("multiformats/dist/types/src").BlockView<EventView<T>, number, number, 1>) => string;
}): AsyncGenerator<string, void, unknown>;
export function findEventsToSync(blocks: any, head: any): Promise<{
    cids: any;
    events: any;
}>;
export function findCommonAncestorWithSortedEvents(events: any, children: any): Promise<{
    ancestor: import("multiformats/dist/types/src").Link<EventView<EventData>, number, number, 1>;
    sorted: import("multiformats/dist/types/src").BlockView<EventView<EventData>, number, number, 1>[];
}>;
/**
 * @template T
 * @implements {EventBlockView<T>}
 */
export class EventBlock<T> extends Block<any, any, any, any> implements EventBlockView<T> {
    /**
     * @template T
     * @param {T} data
     * @param {EventLink<T>[]} [parents]
     */
    static create<T_1>(data: T_1, parents?: import("multiformats/dist/types/src").Link<EventView<T_1>, number, number, 1>[]): Promise<import("multiformats/dist/types/src").BlockView<EventView<T_1>, number, number, 1>>;
    /**
     * @param {object} config
     * @param {EventLink<T>} config.cid
     * @param {Event} config.value
     * @param {Uint8Array} config.bytes
     */
    constructor({ cid, value, bytes }: {
        cid: EventLink<T>;
        value: Event;
        bytes: Uint8Array;
    });
}
/** @template T */
export class EventFetcher<T> {
    /** @param {import('./blockstore').BlockFetcher} blocks */
    constructor(blocks: any);
    /** @private */
    private _blocks;
    _cids: any;
    _cache: Map<any, any>;
    /**
     * @param {EventLink<T>} link
     * @returns {Promise<EventBlockView<T>>}
     */
    get(link: EventLink<T>): Promise<EventBlockView<T>>;
    all(): Promise<any>;
}
export type EventView<T> = {
    parents: EventLink<T>[];
    data: T;
};
export type EventBlockView<T> = import('multiformats').BlockView<EventView<T>>;
export type EventLink<T> = import('multiformats').Link<EventView<T>>;
import { Block } from 'multiformats/block';
//# sourceMappingURL=clock.d.ts.map