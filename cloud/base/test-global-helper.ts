// ts says something like:
// Excessive stack depth comparing types 'TestProject' and 'TestProject'.
//import type { TestProject } from "vitest/node";

export function setTestEnv(project: unknown, env: Record<string, string>) {
  const val = JSON.parse(process.env.FP_TEST_ENV ?? "{}") as Record<string, string>;

  process.env.FP_TEST_ENV = JSON.stringify({ ...val, ...env });
  //  project.provide("FP_TEST_ENV", JSON.stringify(env));
}
