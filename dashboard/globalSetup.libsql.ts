import fs from "fs/promises";
import { $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(project: TestProject) {
  await fs.mkdir("dist", { recursive: true });

  $.verbose = true;
  await $`npx drizzle-kit push --config ./drizzle.libsql.config.ts`;

  return () => {};
}
