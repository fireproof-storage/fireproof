import {
  ClockHead,
  DocFragment,
  DocTypes,
  DocumentRow,
  fireproof,
  IndexKeyType,
  Ledger,
  QueryResponse,
  QueryStreamMarker,
} from "@fireproof/core";

interface DocType {
  _id: string;
  name: string;
}

describe("Streaming API", () => {
  let lr: Ledger;

  const AMOUNT_OF_DOCS = 10;

  beforeEach(async () => {
    lr = fireproof(Date.now().toString());

    await Array(AMOUNT_OF_DOCS)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await lr.put({ _id: `doc-${i}`, name: `doc-${i}` });
      }, Promise.resolve());
  });

  afterEach(async () => {
    await lr.destroy();
  });

  ////////
  // 🛠️ //
  ////////

  type Snapshot<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T> = AsyncGenerator<DocumentRow<K, T, R>>;
  type Stream<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T> = ReadableStream<{
    row: DocumentRow<K, T, R>;
    marker: QueryStreamMarker;
  }>;

  async function testSnapshot<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    snapshot: Snapshot<K, T, R>,
    amountOfDocs: number,
  ) {
    const docs = await Array.fromAsync(snapshot);
    expect(docs.length).toBe(amountOfDocs);
  }

  async function testLive<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    stream: Stream<K, T, R>,
    amountOfDocs: number,
    newProps: { prefix: string; key: string },
  ) {
    let docCount = 0;

    for await (const { marker } of stream) {
      docCount++;

      if (marker.kind === "preexisting" && marker.done) {
        await lr.put({ _id: `${newProps.prefix}${amountOfDocs}`, [newProps.key]: `${newProps.prefix}${amountOfDocs}` });
      }

      if (marker.kind === "new") break;
    }

    expect(docCount).toBe(amountOfDocs + 1);

    // Test that the stream has been closed automatically by `for await`
    const r = stream.getReader();
    await expect(r.closed).resolves.toBe(undefined);
  }

  async function testSince<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>({
    snapshotCreator,
    streamCreator,
  }: {
    snapshotCreator: (since: ClockHead) => Snapshot<K, T, R>;
    streamCreator: (since: ClockHead) => Stream<K, T, R>;
  }) {
    const amountOfNewDocs = Math.floor(Math.random() * (10 - 1) + 1);
    const since = lr.clock;

    await Array(amountOfNewDocs)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await lr.put({ _id: `doc-since-${i}`, since: `doc-since-${i}` });
      }, Promise.resolve());

    const stream = streamCreator(since);
    let docCount = 0;

    for await (const { marker } of stream) {
      docCount++;
      if (marker.kind === "preexisting" && marker.done) break;
    }

    expect(docCount).toBe(amountOfNewDocs);

    // Test that the stream has been closed automatically by `for await`
    const r = stream.getReader();
    await expect(r.closed).resolves.toBe(undefined);

    // Snapshot
    // NOTE: This also tests the stream cancellation process.
    // NOTE: Concurrency limit disallows for using `Promise.all` with x items
    const amountOfSnapshotDocs = Math.floor(Math.random() * (10 - 4) + 4);
    const sincePt2 = lr.clock;

    await Array(amountOfSnapshotDocs)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await lr.put({ _id: `doc-snapshot-${i}`, since: `doc-snapshot-${i}` });
      }, Promise.resolve());

    const docs = await Array.fromAsync(snapshotCreator(sincePt2));
    expect(docs.length).toBe(amountOfSnapshotDocs);
  }

  async function testFuture<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    stream: Stream<K, T, R>,
    amountOfDocs: number,
    newProps: { prefix: string; key: string },
  ) {
    let docCount = 0;

    await lr.put({ _id: `${newProps.prefix}${amountOfDocs + 0}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 0}` });
    await lr.put({ _id: `${newProps.prefix}${amountOfDocs + 1}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 1}` });
    await lr.put({ _id: `${newProps.prefix}${amountOfDocs + 2}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 2}` });

    for await (const { marker } of stream) {
      if (marker.kind === "new") docCount++;
      if (docCount === 3) break;
    }

    expect(docCount).toBe(3);
  }

  async function testSubscribe<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    queryResponse: QueryResponse<K, T, R>,
  ) {
    const row = await new Promise((resolve) => {
      queryResponse.subscribe(resolve);
      lr.put({ _id: `doc-extra`, name: `doc-extra` });
    });

    expect(row).toBeTruthy();
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("doc");
    expect((row as DocumentRow<K, T, R>).doc).toHaveProperty("name");
    // TODO:
    // expect((row as DocumentRow<K, T, R>)?.doc).toBe("doc-extra");
  }

  async function testToArray<K extends IndexKeyType, T extends DocTypes, R extends DocFragment = T>(
    queryResponse: QueryResponse<K, T, R>,
    amountOfDocs: number,
  ) {
    const arr = await queryResponse.toArray();
    expect(arr.length).toBe(amountOfDocs);
  }

  //////////////
  // ALL DOCS //
  //////////////

  describe.skip("allDocs", () => {
    it("test `snapshot` method", async () => {
      const snapshot = lr.allDocs().snapshot();
      await testSnapshot(snapshot, AMOUNT_OF_DOCS);
    });

    it("test `live` method", async () => {
      const stream = lr.allDocs().live();
      await testLive(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
    });

    it("test `snapshot` and `live` method with `since` parameter", async () => {
      await testSince({
        snapshotCreator: (since) => lr.allDocs().snapshot({ since }),
        streamCreator: (since) => lr.allDocs().live({ since }),
      });
    });

    it("test `future` method", async () => {
      const stream = lr.allDocs().future();
      await testFuture(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
    });

    it("test `subscribe` method", async () => {
      await testSubscribe(lr.allDocs());
    });

    it("test `toArray` method", async () => {
      await testToArray(lr.allDocs(), AMOUNT_OF_DOCS);
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
        await testLive(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => lr.query("since").snapshot({ since }),
          streamCreator: (since) => lr.query("since").live({ since }),
        });
      });

      it("test `future` method", async () => {
        const stream = lr.query("name").future();
        await testFuture(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
      });

      it("test `subscribe` method", async () => {
        await testSubscribe(lr.query<string, DocType>("name"));
      });

      it("test `toArray` method", async () => {
        await testToArray(lr.query<string, DocType>("name"), AMOUNT_OF_DOCS);
      });
    });

    // ADDITIONAL
    describe("additional items", () => {
      const AMOUNT_OF_ADDITIONAL_DOCS = 5;

      beforeEach(async () => {
        await Array(AMOUNT_OF_ADDITIONAL_DOCS)
          .fill(0)
          .reduce(async (acc, _, i) => {
            await acc;
            await lr.put({ _id: `doc-add-${i}`, additional: `doc-add-${i}` });
          }, Promise.resolve());
      });

      it("test `snapshot` method", async () => {
        const snapshot = lr.query("additional").snapshot();
        await testSnapshot(snapshot, AMOUNT_OF_ADDITIONAL_DOCS);
      });

      it("test `live` method", async () => {
        const stream = lr.query("additional").live();
        await testLive(stream, AMOUNT_OF_ADDITIONAL_DOCS, { prefix: "doc-add-future-", key: "additional" });
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => lr.query("since").snapshot({ since }),
          streamCreator: (since) => lr.query("since").live({ since }),
        });
      });

      it("test `future` method", async () => {
        const stream = lr.query("additional").future();
        await testFuture(stream, AMOUNT_OF_ADDITIONAL_DOCS, { prefix: "doc-add-", key: "additional" });
      });

      it("test `subscribe` method", async () => {
        await testSubscribe(lr.query<string, DocType>("name"));
      });

      it("test `toArray` method", async () => {
        await testToArray(lr.query<string, DocType>("additional"), AMOUNT_OF_ADDITIONAL_DOCS);
      });
    });

    // EXCLUDE DOCS
    describe("excludeDocs", () => {
      it("inquiry", async () => {
        const inquiry = lr.query("name", {
          excludeDocs: true,
        });

        const arr = await inquiry.toArray();
        const doc = arr[0];

        expect(doc).toBeTruthy();
        expect(doc).not.toHaveProperty("doc");
      });
    });
  });
});
