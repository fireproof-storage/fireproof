import { ResolveOnce } from "@adviser/cement";
import { cd, $ } from "zx";
import type { TestProject } from "vitest/node";

export async function setup(project: TestProject) {
  const root = project.toJSON().serializedConfig.root;

  $.verbose = true;
  cd(root);
  const id = Math.random();
  const gt = globalThis as { fpMinioSetupOnce?: ResolveOnce<void> };
  gt.fpMinioSetupOnce = gt.fpMinioSetupOnce || new ResolveOnce<void>();
  await gt.fpMinioSetupOnce.once(async () => {
    // eslint-disable-next-line no-console
    console.log("minio spinning up", id);
    await $`docker compose -f ../../docker-compose.yaml up -d`;
  });
  // eslint-disable-next-line no-console
  console.log("minio ready", id, gt.fpMinioSetupOnce.ready);
}

// docker-compose -f cloud/docker-compose.yaml up
