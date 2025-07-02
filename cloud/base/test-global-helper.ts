import type { TestProject } from "vitest/node";

export function setTestEnv(project: TestProject, env: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore-next-line

  const val = JSON.parse(process.env.FP_TEST_ENV || "{}");

  process.env.FP_TEST_ENV = JSON.stringify({ ...val, ...env });
  //  project.provide("FP_TEST_ENV", JSON.stringify(env));
}
