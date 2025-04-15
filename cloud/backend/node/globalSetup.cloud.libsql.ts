import fs from "fs/promises";
import { drizzle } from "drizzle-orm/libsql";
import { mockJWK, portRandom, setupBackendNode } from "../node/test-helper.js";
import { createClient } from "@libsql/client";
import { $ } from "zx";
import { ensureSuperThis, rt } from "@fireproof/core";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "../../test-global-helper.js";

export async function setup(project: TestProject) {
  const sthis = ensureSuperThis();
  const keys = await mockJWK(sthis);

  await fs.mkdir("dist", { recursive: true });

  await $`npx drizzle-kit push --config ./cloud/backend/node/drizzle.cloud.libsql.config.ts`;

  const port = portRandom(sthis);
  const env = {
    // FP_STORAGE_URL: keys
    //   .applyAuthToURI(`fpcloud://localhost:${port}/?tenant=${sthis.nextId().str}&ledger=test-l&protocol=ws`)
    //   .toString(),
    [rt.sts.envKeyDefaults.PUBLIC]: keys.keys.strings.publicKey,
    [rt.sts.envKeyDefaults.SECRET]: keys.keys.strings.privateKey,
    STORAGE_URL: "http://localhost:9000/testbucket",
    ACCESS_KEY_ID: "minioadmin",
    FP_ENDPOINT: sthis.env.get("FP_ENDPOINT") ?? `http://localhost:${port}`,
    SECRET_ACCESS_KEY: "minioadmin",
  };
  setTestEnv(project, env);

  sthis.env.sets(env);
  const params = await setupBackendNode(
    sthis,
    drizzle(createClient({ url: `file://${process.cwd()}/dist/cloud-backend-node.sqlite` })),
    port,
  );

  return () => params.hs.close();
}
