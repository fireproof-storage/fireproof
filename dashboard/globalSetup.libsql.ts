import fs from "fs/promises";
import path from "node:path";
import { cd, $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;

  $.verbose = true;
  cd(root);
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await $`pnpm exec drizzle-kit push --config ./drizzle.libsql.config.ts`;

  return () => {};
}
