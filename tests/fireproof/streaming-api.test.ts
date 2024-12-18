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
 * -------
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

import { fireproof, Ledger } from "@fireproof/core";

interface DocType {
  _id: string;
  name: string;
}

describe("query api", () => {
  let lr: Ledger;

  const AMOUNT_OF_DOCS = 10;

  beforeEach(async () => {
    lr = fireproof(Date.now().toString());

    await Promise.all(
      Array(AMOUNT_OF_DOCS)
        .fill(0)
        .map((_, i) => {
          return lr.put({ _id: `doc-${i}`, name: `doc-${i}` });
        }),
    );
  });

  afterEach(async () => {
    await lr.destroy();
  });

  describe("allDocs", () => {
    it("test `snapshot` method", async () => {
      const docs = await lr.allDocs().snapshot();
      expect(docs.length).toBe(AMOUNT_OF_DOCS);
    });
    it("test `live` method", async () => {
      const stream = lr.allDocs<DocType>().live();
      let docCount = 0;

      for await (const { doc, marker } of stream) {
        void doc;
        docCount++;

        if (marker.kind === "preexisting" && marker.done) {
          await lr.put({ _id: `doc-${AMOUNT_OF_DOCS}`, name: `doc-${AMOUNT_OF_DOCS}` });
        }

        if (marker.kind === "new") break;
      }

      expect(docCount).toBe(AMOUNT_OF_DOCS + 1);
    });
    it("test `future` method", async () => {
      const stream = lr.allDocs<DocType>().future();
      let docCount = 0;

      // NOTE: Test could probably be written in a better way.
      //       We want to start listening before we add the documents.
      lr.put({ _id: `doc-${AMOUNT_OF_DOCS + 0}`, name: `doc-${AMOUNT_OF_DOCS + 0}` });
      lr.put({ _id: `doc-${AMOUNT_OF_DOCS + 1}`, name: `doc-${AMOUNT_OF_DOCS + 1}` });

      for await (const { doc, marker } of stream) {
        void doc;

        if (marker.kind === "new") docCount++;
        if (docCount === 2) break;
      }

      expect(docCount).toBe(2);
    });
  });
});
