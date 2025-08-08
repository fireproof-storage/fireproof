import { describe, it } from "vitest";
// import { SimpleTokenStrategy } from "@fireproof/core-gateways-cloud";
import { useFireproof, toCloud } from "use-fireproof";
import { renderHook } from "@testing-library/react";
import { SimpleTokenStrategy } from "@fireproof/core-gateways-cloud";

describe("Dynamic DB and Attach", () => {
  it.each(
    Array(10)
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

    await db.database.put({ _id: `test-${name}`, value: `test-${name}` });
    await db.database.close();
  });
});
