import { ClockHead, DocBase, DocWithId, fireproof, Ledger, QueryResponse, QueryStreamMarker } from "@fireproof/core";

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

    // Test that the stream has been closed automatically by `for await`
    const r = stream.getReader();
    expect(r.closed).resolves.toBe(undefined);
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

    // Test that the stream has been closed automatically by `for await`
    const r = stream.getReader();
    expect(r.closed).resolves.toBe(undefined);

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

  async function testSubscribe<T extends DocBase>(queryResponse: QueryResponse<T>) {
    const doc = await new Promise((resolve) => {
      queryResponse.subscribe(resolve);
      lr.put({ _id: `doc-extra`, name: `doc-extra` });
    });

    expect(doc).toBeTruthy();
    expect(doc).toHaveProperty("_id");
    expect(doc).toHaveProperty("name");
    expect((doc as DocType).name).toBe("doc-extra");
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
      const stream = lr.allDocs().live();
      await testLive(stream, AMOUNT_OF_DOCS);
    });

    it("test `snapshot` and `live` method with `since` parameter", async () => {
      await testSince({
        snapshotCreator: (since) => lr.allDocs().snapshot({ since }),
        streamCreator: (since) => lr.allDocs().live({ since }),
      });
    });

    it("test `future` method", async () => {
      const stream = lr.allDocs().future();
      await testFuture(stream, AMOUNT_OF_DOCS);
    });

    it("test `subscribe` method", async () => {
      await testSubscribe(lr.allDocs<DocType>());
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

      it("test `subscribe` method", async () => {
        await testSubscribe(lr.query<string, DocType>("name"));
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

      it("test `subscribe` method", async () => {
        await testSubscribe(lr.query<string, DocType>("name"));
      });
    });
  });
});
