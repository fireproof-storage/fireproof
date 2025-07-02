import { cd, $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;
  $.verbose = true;
  cd(root);
  return () => {
    /* no-op */
  };
}
