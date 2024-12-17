/*
 * The streaming API to come to query and allDocs in Database class
 *
 * we should incorporate the changes of this PR into this:
 *   https://github.com/fireproof-storage/fireproof/pull/315
 *
 * We need new Methods or a structure return value like this:
 * Due to that we need to harmonize the return values of both methods to
 * return the same structure. I think we should go with an approach like
 * the Response object in the fetch API.
 * interface QueryResponse {
 *  rows(): Promise<DocWithId[]>;
 *  iterator(): AsyncIterableIterator<DocWithId>;
 *  stream(): ReadableStream<DocWithId>;
 *  subscribe(callback: (doc: DocWithId) => void): unsubscribe() => void;
 * }
 * it should only possible to call every method once.
 * if you call it twice it should throw an error
 * Keep in mind that the iterator and stream should be able to
 * substitute the changes method. So we need the possibility to
 * pass options to allDocs and or query to change the behavior:
 * - SNAPSHOT default -> means it returns the current state of the database and
 *   closes the stream after that.
 * - LIVE -> means it returns the current state of the database and keeps the stream open
 * - FUTURE -> means it keeps the stream open for new records which meet the query arguments
 *   (this might be dropped and simulated with the startpoint option in LIVE mode)
 *
 * the rows method will only behave in SNAPSHOT mode.
 * We should be able to extend in future implemenation pass a startpoint to LIVE.
 *
 * The first group of tests should verify that query and allDocs both return the same
 * QueryResponse object and implement rows method. The test should check if rows
 * returns empty arrays if the database is empty and if it returns the correct # documents
 * in the database. There should be a test to check for the double call error.
 *
 * The second group of tests should verify that the iterator and stream method works as expected in
 * SNAPSHOT mode. Both should pass the same tests as the rows method. These tests should verify that
 * we are able to stream documents from the database without loosing memory. We should test if
 * close/unsubscribe of the stream works as expected.
 *
 * Future milestone:
 * The third group of tests should verify that the iterator and stream method works as expected in
 * LIVE and FUTURE mode. In this mode we need to check if the stream receives new documents which
 * are written to the database after the stream was created. We should think about the raise condition
 * of loosing document events between the allDocs and query call and the creation of the stream.
 *
 */

import { fireproof, Ledger } from '@fireproof/core';

describe('query api', () => {
    let lr: Ledger
    beforeEach(async () => {
        lr = fireproof("name")
        await Promise.all(Array(10).fill(0).map((_, i) => {
            lr.put({ id: `doc-${i}`, name: `doc-${i}` })
        }))
    })
    afterEach(async () => {
        await lr.destroy()
    })
    for (const method of [
        {
            name: "query",
            fn: () => lr.query("name")
        },
        {
            name: "allDocs",
            fn: () => lr.allDocs()
        }]) {
        describe(`${method.name} method`, () => {
            it("double call error", async () => {
                const q = await method.fn()
                expect(() => q.rows()).not.toThrowError()
                expect(async () => method.fn()).toThrowError()
            })
            it("test rows method", () => {
                method.fn().then(r => r.rows()).then((docs) => {
                })
            })
        })
    }
})
