import {
  ClockHead,
  Database,
  DocFragment,
  DocTypes,
  DocumentRow,
  fireproof,
  IndexKeyType,
  QueryResponse,
  QueryStreamMarker,
} from "@fireproof/core";

interface DocType {
  _id: string;
  name: string;
}

describe("Streaming API", () => {
  let db: Database;

  const AMOUNT_OF_DOCS = 10;

  beforeEach(async () => {
    db = fireproof(Date.now().toString());

    await Array(AMOUNT_OF_DOCS)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await db.put({ _id: `doc-${i}`, name: `doc-${i}` });
      }, Promise.resolve());
  });

  afterEach(async () => {
    await db.destroy();
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
        await db.put({ _id: `${newProps.prefix}${amountOfDocs}`, [newProps.key]: `${newProps.prefix}${amountOfDocs}` });
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
    const since = db.clock;

    await Array(amountOfNewDocs)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await db.put({ _id: `doc-since-${i}`, since: `doc-since-${i}` });
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
    const sincePt2 = db.clock;

    await Array(amountOfSnapshotDocs)
      .fill(0)
      .reduce(async (acc, _, i) => {
        await acc;
        await db.put({ _id: `doc-snapshot-${i}`, since: `doc-snapshot-${i}` });
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

    await db.put({ _id: `${newProps.prefix}${amountOfDocs + 0}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 0}` });
    await db.put({ _id: `${newProps.prefix}${amountOfDocs + 1}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 1}` });
    await db.put({ _id: `${newProps.prefix}${amountOfDocs + 2}`, [newProps.key]: `${newProps.prefix}${amountOfDocs + 2}` });

    for await (const { row, marker } of stream) {
      console.log(row, marker);
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
      db.put({ _id: `doc-extra`, name: `doc-extra` });
    });

    expect(row).toBeTruthy();
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("doc");
    expect((row as DocumentRow<K, T, R>).doc).toHaveProperty("name");
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

  describe("allDocs", () => {
    it("test `snapshot` method", async () => {
      const snapshot = db.select().snapshot();
      await testSnapshot(snapshot, AMOUNT_OF_DOCS);
    });

    it("test `live` method", async () => {
      const stream = db.select().live();
      await testLive(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
    });

    it("test `snapshot` and `live` method with `since` parameter", async () => {
      await testSince({
        snapshotCreator: (since) => db.select().snapshot({ since }),
        streamCreator: (since) => db.select().live({ since }),
      });
    });

    it("test `future` method", async () => {
      const stream = db.select().future();
      await testFuture(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
    });

    it("test `subscribe` method", async () => {
      await testSubscribe(db.select());
    });

    it("test `toArray` method", async () => {
      await testToArray(db.select(), AMOUNT_OF_DOCS);
    });
  });

  ///////////
  // QUERY //
  ///////////

  describe("query", () => {
    // ALL
    describe("all", () => {
      it("test `snapshot` method", async () => {
        const snapshot = db.select("name").snapshot();
        await testSnapshot(snapshot, AMOUNT_OF_DOCS);
      });

      it("test `live` method", async () => {
        const stream = db.select("name").live();
        await testLive(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => db.select("since").snapshot({ since }),
          streamCreator: (since) => db.select("since").live({ since }),
        });
      });

      it.only("test `future` method", async () => {
        const stream = db.select("name").future();
        await testFuture(stream, AMOUNT_OF_DOCS, { prefix: "doc-", key: "name" });
      });

      it("test `subscribe` method", async () => {
        await testSubscribe(db.select<string, DocType>("name"));
      });

      it("test `toArray` method", async () => {
        await testToArray(db.select<string, DocType>("name"), AMOUNT_OF_DOCS);
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
            await db.put({ _id: `doc-add-${i}`, additional: `doc-add-${i}` });
          }, Promise.resolve());
      });

      it("test `snapshot` method", async () => {
        const snapshot = db.select("additional").snapshot();
        await testSnapshot(snapshot, AMOUNT_OF_ADDITIONAL_DOCS);
      });

      it("test `live` method", async () => {
        const stream = db.select("additional").live();
        await testLive(stream, AMOUNT_OF_ADDITIONAL_DOCS, { prefix: "doc-add-future-", key: "additional" });
      });

      it("test `snapshot` and `live` method with `since` parameter", async () => {
        await testSince({
          snapshotCreator: (since) => db.select("since").snapshot({ since }),
          streamCreator: (since) => db.select("since").live({ since }),
        });
      });

      it("test `future` method", async () => {
        const stream = db.select("additional").future();
        await testFuture(stream, AMOUNT_OF_ADDITIONAL_DOCS, { prefix: "doc-add-", key: "additional" });
      });

      it("test `subscribe` method", async () => {
        await testSubscribe(db.select<string, DocType>("name"));
      });

      it("test `toArray` method", async () => {
        await testToArray(db.select<string, DocType>("additional"), AMOUNT_OF_ADDITIONAL_DOCS);
      });
    });

    // EXCLUDE DOCS
    describe("excludeDocs", () => {
      it("inquiry", async () => {
        const inquiry = db.select("name", {
          excludeDocs: true,
        });

        const arr = await inquiry.toArray();
        const doc = arr[0];

        expect(doc).toBeTruthy();
        expect(doc).not.toHaveProperty("doc");
      });

      it("test `subscribe` method", async () => {
        const row = await new Promise((resolve) => {
          db.select<string, DocType>("name", { excludeDocs: true }).subscribe(resolve);
          db.put({ _id: `doc-extra`, name: `doc-extra` });
        });

        expect(row).toBeTruthy();
        expect(row).toHaveProperty("id");
        expect(row).toHaveProperty("key");
        expect(row).toHaveProperty("value");
      });
    });
  });
});
