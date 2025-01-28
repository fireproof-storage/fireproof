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

import { ClockHead, DocBase, DocWithId, fireproof, Ledger, QueryStreamMarker } from "@fireproof/core";

interface DocType {
  _id: string;
  name: string;
}

describe("Streaming API", () => {
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

  ////////
  // 🛠️ //
  ////////

  type Snapshot<T extends DocBase> = AsyncGenerator<DocWithId<T>>;
  type Stream<T extends DocBase> = ReadableStream<{ doc: DocWithId<T>; marker: QueryStreamMarker }>;

  async function testSnapshot<T extends DocBase>(snapshot: Snapshot<T>, amountOfDocs: number) {
    const docs = await Array.fromAsync(snapshot);
    expect(docs.length).toBe(amountOfDocs);
  }

  async function testLive<T extends DocBase>(stream: Stream<T>, amountOfDocs: number) {
    let docCount = 0;

    for await (const { marker } of stream) {
      docCount++;

      if (marker.kind === "preexisting" && marker.done) {
        await lr.put({ _id: `doc-${amountOfDocs}`, name: `doc-${amountOfDocs}` });
      }

      if (marker.kind === "new") break;
    }

    expect(docCount).toBe(amountOfDocs + 1);
  }

  async function testSince<T extends DocBase>({
    snapshotCreator,
    streamCreator,
  }: {
    snapshotCreator: (since: ClockHead) => Snapshot<T>;
    streamCreator: (since: ClockHead) => Stream<T>;
  }) {
    const amountOfNewDocs = Math.floor(Math.random() * (10 - 1) + 1);
    const since = lr.clock;

    await Promise.all(
      Array(amountOfNewDocs)
        .fill(0)
        .map((_, i) => {
          return lr.put({ _id: `doc-since-${i}`, since: `doc-since-${i}` });
        }),
    );

    const stream = streamCreator(since);
    let docCount = 0;

    for await (const { marker } of stream) {
      docCount++;
      if (marker.kind === "preexisting" && marker.done) break;
    }

    expect(docCount).toBe(amountOfNewDocs);

    // Snapshot
    // NOTE: This also tests the stream cancellation process.
    const amountOfSnapshotDocs = Math.floor(Math.random() * (10 - 1) + 1);
    const sincePt2 = lr.clock;

    await Promise.all(
      Array(amountOfSnapshotDocs)
        .fill(0)
        .map((_, i) => {
          return lr.put({ _id: `doc-snapshot-${i}`, since: `doc-snapshot-${i}` });
        }),
    );

    const docs = await Array.fromAsync(snapshotCreator(sincePt2));
    expect(docs.length).toBe(amountOfSnapshotDocs);
  }

  async function testFuture<T extends DocBase>(stream: Stream<T>, amountOfDocs: number) {
    let docCount = 0;

    await lr.put({ _id: `doc-${amountOfDocs + 0}`, name: `doc-${amountOfDocs + 0}` });
    await lr.put({ _id: `doc-${amountOfDocs + 1}`, name: `doc-${amountOfDocs + 1}` });
    await lr.put({ _id: `doc-${amountOfDocs + 2}`, name: `doc-${amountOfDocs + 2}` });

    for await (const { marker } of stream) {
      if (marker.kind === "new") docCount++;
      if (docCount === 3) break;
    }

    expect(docCount).toBe(3);
  }

  //////////////
  // ALL DOCS //
  //////////////

  describe("allDocs", () => {
    it("test `snapshot` method", async () => {
      const snapshot = lr.allDocs().snapshot();
      await testSnapshot(snapshot, AMOUNT_OF_DOCS);
    });

    it("test `live` method", async () => {
      const stream = lr.allDocs<DocType>().live();
      await testLive(stream, AMOUNT_OF_DOCS);
    });

    it("test `snapshot` and `live` method with `since` parameter", async () => {
      await testSince({
        snapshotCreator: (since) => lr.allDocs().snapshot({ since }),
        streamCreator: (since) => lr.allDocs().live({ since }),
      });
    });

    it("test `future` method", async () => {
      const stream = lr.allDocs<DocType>().future();
      await testFuture(stream, AMOUNT_OF_DOCS);
    });
  });

  ///////////
  // QUERY //
  ///////////

  describe("query", () => {
    // ALL
    describe("all", () => {
      it("test `snapshot` method", async () => {
        const snapshot = lr.query("name").snapshot();
        await testSnapshot(snapshot, AMOUNT_OF_DOCS);
      });

      it("test `live` method", async () => {
        const stream = lr.query("name").live();
        await testLive(stream, AMOUNT_OF_DOCS);
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => lr.query("since").snapshot({ since }),
          streamCreator: (since) => lr.query("since").live({ since }),
        });
      });

      it("test `future` method", async () => {
        const stream = lr.query("name").future();
        await testFuture(stream, AMOUNT_OF_DOCS);
      });
    });

    // ADDITIONAL
    describe("additional items", () => {
      const AMOUNT_OF_ADDITIONAL_DOCS = 5;

      beforeEach(async () => {
        await Promise.all(
          Array(AMOUNT_OF_ADDITIONAL_DOCS)
            .fill(0)
            .map((_, i) => {
              return lr.put({ _id: `doc-add-${i}`, additional: `doc-add-${i}` });
            }),
        );
      });

      it("test `snapshot` method", async () => {
        const snapshot = lr.query("additional").snapshot();
        await testSnapshot(snapshot, AMOUNT_OF_ADDITIONAL_DOCS);
      });

      it("test `live` method", async () => {
        const stream = lr.query("additional").live();
        await testLive(stream, AMOUNT_OF_ADDITIONAL_DOCS);
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => lr.query("since").snapshot({ since }),
          streamCreator: (since) => lr.query("since").live({ since }),
        });
      });

      it("test `future` method", async () => {
        const stream = lr.query("additional").future();
        await testFuture(stream, AMOUNT_OF_ADDITIONAL_DOCS);
      });
    });
  });
});
