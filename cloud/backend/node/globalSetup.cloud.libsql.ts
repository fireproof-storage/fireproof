import fs from "fs/promises";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { $ } from "zx";
import type { TestProject } from "vitest/node";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { mockJWK, portRandom } from "@fireproof/cloud-backend-base";
import { setTestEnv } from "@fireproof/cloud-base";
import { setupBackendNode } from "./setup-backend-node.js";

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
    [sts.envKeyDefaults.PUBLIC]: keys.keys.strings.publicKey,
    [sts.envKeyDefaults.SECRET]: keys.keys.strings.privateKey,
    STORAGE_URL: "http://127.0.0.1:9000/testbucket",
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
