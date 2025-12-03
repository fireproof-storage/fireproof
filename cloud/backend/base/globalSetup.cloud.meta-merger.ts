import fs from "fs/promises";
import { $, path } from "zx";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "@fireproof/cloud-base";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;

  $.verbose = true;

  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await $`(cd ${root} && pnpm exec drizzle-kit push --config ./drizzle.cloud.meta-merger.config.ts)`;

  const env = {
    FP_TEST_SQL_URL: `file://${root}/dist/cloud-backend-meta-merger.sqlite`,
  };
  setTestEnv(project, env);
}
