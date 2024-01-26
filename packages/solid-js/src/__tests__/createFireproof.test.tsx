import { createRoot } from "solid-js";
import { describe, expect, test } from "vitest";

import { createFireproof } from "../createFireproof";

type TestDoc = { text: string; completed: boolean };

const sleepHalfSecond = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms));

describe("HOOK: createFireproof", () => {
  test("can perform all expected actions", async () => {
    await createRoot(async (dispose) => {
      const { database, createDocument, createLiveQuery } = createFireproof("TestDB");
      const [doc, setDoc, saveDoc] = createDocument<TestDoc>(() => ({ text: "", completed: false }));
      const query = createLiveQuery("_id");
      await sleepHalfSecond(); // wait for the initial createDocument effect to finish

      // 1. Can initialize a document
      expect(doc()).toEqual({ text: "", completed: false });

      // 2. Can update the document
      setDoc({ text: "hello", completed: true });
      expect(doc()).toEqual({ text: "hello", completed: true });
      expect((await database().allDocs()).rows).toEqual([]);
      expect(query().docs).toEqual([]);

      // 3. Can save the document to the database
      const { id } = await saveDoc();
      expect(await database().get<TestDoc>(id)).toEqual({ _id: id, text: "hello", completed: true });
      expect(doc()).toEqual({ _id: id, text: "hello", completed: true });

      await sleepHalfSecond();
      expect(query().docs).toEqual([
        {
          _id: id,
          text: "hello",
          completed: true,
        },
      ]);

      // 4. Can locally update the same document (retaining _id info post first save)
      setDoc({ text: "world", completed: false });
      expect(doc()).toEqual({ _id: id, text: "world", completed: false });
      expect(await database().get<TestDoc>(id)).toEqual({ _id: id, text: "hello", completed: true });
      expect(query().docs).toEqual([
        {
          _id: id,
          text: "hello",
          completed: true,
        },
      ]);

      // 5. Can update the stored document
      await saveDoc();
      expect(await database().get<TestDoc>(id)).toEqual({ _id: id, text: "world", completed: false });
      expect(doc()).toEqual({ _id: id, text: "world", completed: false });

      await sleepHalfSecond();
      expect(query().docs).toEqual([
        {
          _id: id,
          text: "world",
          completed: false,
        },
      ]);

      // 6. Can start anew with another document
      setDoc();
      expect(doc()).toEqual({ text: "", completed: false });

      // 7. Can update the new document
      setDoc({ text: "foo", completed: true });
      expect(doc()).toEqual({ text: "foo", completed: true });

      // 8. Can save the new document
      const { id: id2 } = await saveDoc();
      expect(doc()).toEqual({ _id: id2, text: "foo", completed: true });
      expect(await database().get<TestDoc>(id2)).toEqual({ _id: id2, text: "foo", completed: true });

      await sleepHalfSecond();
      expect(query().docs).toEqual([
        {
          _id: id,
          text: "world",
          completed: false,
        },
        {
          _id: id2,
          text: "foo",
          completed: true,
        },
      ]);

      // Test cleanup to not keep data in the database across tests
      await database().del(id);
      await database().del(id2);

      expect(
        await database()
          .get(id)
          .catch(() => null)
      ).toBeNull();

      expect(
        await database()
          .get(id2)
          .catch(() => null)
      ).toBeNull();

      expect(query().docs).toEqual([]);
      dispose();
    });
  });
});
