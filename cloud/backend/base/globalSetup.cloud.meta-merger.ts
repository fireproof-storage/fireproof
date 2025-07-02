import fs from "fs/promises";
import { cd, $ } from "zx";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "@fireproof/cloud-base";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;

  $.verbose = true;
  cd(root);

  await fs.mkdir("dist", { recursive: true });
  await $`pnpm exec drizzle-kit push --config ./drizzle.cloud.meta-merger.config.ts`;

  const env = {
    FP_TEST_SQL_URL: `file://${process.cwd()}/dist/cloud-backend-meta-merger.sqlite`,
  };
  setTestEnv(project, env);
}
