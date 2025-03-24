import { ensureSuperThis } from "@fireproof/core";
import { inject } from "vitest";

export function testSuperThis() {
  return ensureSuperThis({
    env: {
      presetEnv: new Map<string, string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries({ ...(globalThis as any).FP_ENV, ...JSON.parse(inject("FP_TEST_ENV" as never)) }),
      ),
    },
  });
}
