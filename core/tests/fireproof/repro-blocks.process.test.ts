import { describe, it, expect } from "vitest";

// Skip this entire suite when running inside a browser-like Vitest environment
const isNode = typeof process !== "undefined" && !!process.versions?.node;
const describeFn = isNode ? describe : describe.skip;

// everything node-specific is imported lazily inside the test body

/* eslint-disable no-console */

async function runScriptOnce(iter: number) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { default: path } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const execFileAsync = promisify(execFile);
  const __filename = fileURLToPath(import.meta.url);
  const __dirnameNode = path.dirname(__filename);
  const scriptPath = path.resolve(__dirnameNode, "./repro-blocks.script.ts");

  const { stdout, stderr } = await execFileAsync("pnpm", ["exec", "tsx", scriptPath], {
    env: { ...process.env, FP_DEBUG: "Loader" },
    maxBuffer: 10 * 1024 * 1024, // 10 MB
  });

  // Ensure no unexpected stderr
  expect(stderr).toBe("");
  // Guard against any compaction error messages
  expect(stdout).not.toMatch(/Missing (head|block)|compact inner fn threw/i);
  console.log(`repro-blocks run ${iter}: ok`); // useful in CI logs
}

describeFn("repro-blocks script – process-level regression", () => {
  it(
    "runs 10 consecutive times without compaction errors",
    async () => {
      for (let i = 1; i <= 10; i++) {
        await runScriptOnce(i);
      }
    },
    5 * 60 * 1000, // allow up to 5 minutes – heavy disk workload
  );
});
