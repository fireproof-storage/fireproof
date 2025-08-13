import { describe, expect, it } from "vitest";
// import { SimpleTokenStrategy } from "@fireproof/core-gateways-cloud";
import { useFireproof, toCloud } from "use-fireproof";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SimpleTokenStrategy } from "@fireproof/core-gateways-cloud";

describe("Dynamic DB and Attach", () => {
  it.each(
    Array(2)
      .fill(0)
      .map((_, i) => ({ name: `db-${i}` })),
  )("should work $name", async ({ name }) => {
    let db!: ReturnType<typeof useFireproof>;
    renderHook(async () => {
      db = useFireproof(name, {
        storeUrls: {
          base: `memory://${name}`,
        },
        attach: toCloud({
          urls: { base: "memory://test" },
          strategy: new SimpleTokenStrategy(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30",
          ),
        }),
      });
    });
    await waitFor(() => {
      expect(db.attach.state).toBe("attached");
    });

    await db.database.put({ _id: `test-${name}`, value: `test-${name}` });
    await db.database.close();
  });

  it("multiple calls to useFireproof", async () => {
    for (let i = 0; i < 10; i++) {
      let db!: ReturnType<typeof useFireproof>;
      renderHook(async () => {
        db = useFireproof("test-multi", {
          storeUrls: {
            base: `memory://test-multi`,
          },
          attach: toCloud({
            urls: { base: "memory://test" },
            strategy: new SimpleTokenStrategy(
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30",
            ),
          }),
        });
      });
      await db.database.put({ _id: `test-${i}`, value: `test-${i}` });

      // await waitFor(() => {
      //   // console.log("attach state", db.attach.state);
      //   expect(db.attach.state).toBe("attached");
      // }, { timeout: 10000 });
    }
  });
});
