import fs from "fs/promises";
import { mockJWK } from "../node/test-helper.js";
import { ensureSuperThis, rt } from "@fireproof/core";
import { $ } from "zx";
import { setupBackendD1 } from "./setup-backend-d1.js";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "../../test-global-helper.js";

export async function setup(project: TestProject) {
  const sthis = ensureSuperThis();
  const keys = await mockJWK(sthis);

  let params: { port: number; pid?: number };
  let FP_ENDPOINT = sthis.env.get("FP_ENDPOINT");
  if (FP_ENDPOINT) {
    params = { port: 0 };
  } else {
    await fs.mkdir("dist", { recursive: true });

    $.verbose = !!sthis.env.get("FP_DEBUG");
    // create db
    await $`wrangler -c cloud/backend/cf-d1/wrangler.toml -e test d1  execute test-meta-merge --local --command "select 'meno'"`;
    // setup sql
    await $`npx drizzle-kit push --config ./cloud/backend/cf-d1/drizzle.cloud.d1-local.config.ts --force`;

    params = await setupBackendD1(sthis, keys, "cloud/backend/cf-d1/wrangler.toml", "test");
    FP_ENDPOINT = `http://localhost:${params.port}`;
  }

  setTestEnv(project, {
    [rt.sts.envKeyDefaults.PUBLIC]: keys.keys.strings.publicKey,
    STORAGE_URL: sthis.env.get("STORAGE_URL") ?? "http://localhost:9000/testbucket",
    ACCESS_KEY_ID: sthis.env.get("ACCESS_KEY_ID") ?? "minioadmin",
    SECRET_ACCESS_KEY: sthis.env.get("SECRET_ACCESS_KEY") ?? "minioadmin",
    FP_ENDPOINT,
    FP_STORAGE_URL: keys
      .applyAuthToURI(`fpcloud://localhost:${params.port}/?tenant=${sthis.nextId().str}&ledger=test-l&protocol=ws`)
      .toString(),
  });

  return () => {
    if (params.pid) {
      // eslint-disable-next-line no-console
      console.log("Stopping wrangler-backend process - ", params.pid);
      process.kill(params.pid);
    }
  };
}
