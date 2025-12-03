import { $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(_project: TestProject) {
  // const root = project.toJSON().serializedConfig.root;
  // $.verbose = true;
  return () => {
    /* no-op */
  };
}
