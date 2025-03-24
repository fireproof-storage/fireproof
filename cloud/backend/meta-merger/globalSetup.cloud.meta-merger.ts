import fs from "fs/promises";
import { $ } from "zx";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "../../test-global-helper.js";

export async function setup(project: TestProject) {
  await fs.mkdir("dist", { recursive: true });

  await $`npx drizzle-kit push --config ./cloud/backend/meta-merger/drizzle.cloud.meta-merger.config.ts`;

  setTestEnv(project, {
    FP_TEST_SQL_URL: `file://${process.cwd()}/dist/cloud-backend-meta-merger.sqlite`,
  });
}
