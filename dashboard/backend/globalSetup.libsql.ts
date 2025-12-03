import fs from "fs/promises";
import path from "node:path";
import { $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;

  $.verbose = true;
  // cd(root);
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  const dashSQLite = `file://${root}/dist/dash-backend.sqlite`;
  await $`(cd ${root} && DASH_FP_TEST_SQL_URL=${dashSQLite} pnpm exec drizzle-kit push --config ./drizzle.libsql.config.ts)`;

  project.provide("DASH_FP_TEST_SQL_URL" as never, dashSQLite as never);
  console.log("Provided DASH_FP_TEST_SQL_URL:", dashSQLite);

  return () => {
    /* */
  };
}
