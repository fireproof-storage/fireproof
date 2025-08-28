import { ensureSuperThis } from "@fireproof/core-runtime";
// import { inject } from "vitest";

export function testSuperThis(options?: { fetch?: typeof fetch }) {
  return ensureSuperThis({
    env: {
      presetEnv: new Map<string, string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries({ ...(globalThis as any).FP_ENV, ...JSON.parse(process.env.FP_TEST_ENV || "{}") }),
      ),
    },
    fetch: options?.fetch,
  });
}
