import type { TestProject } from "vitest/dist/node.js";

export function setTestEnv(project: TestProject, env: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore-next-line
  project.provide("FP_TEST_ENV", JSON.stringify(env));
}
