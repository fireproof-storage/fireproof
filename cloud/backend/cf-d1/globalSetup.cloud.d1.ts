import fs from "fs/promises";
import { mockJWK } from "../node/test-helper.js";
import { ensureSuperThis, rt } from "@fireproof/core";
import { $, dotenv } from "zx";
import { setupBackendD1 } from "./setup-backend-d1.js";
import type { TestProject } from "vitest/node";
import { setTestEnv } from "../../test-global-helper.js";

export async function setup(project: TestProject) {
  if (typeof process.env.FP_ENV === "string") {
    dotenv.config(process.env.FP_ENV ?? ".env");
    // eslint-disable-next-line no-console
    console.log("Loaded env from", process.env.FP_ENV);
  }
  const sthis = ensureSuperThis();
  const keys = await mockJWK(sthis);

  let params: { port: number; pid?: number };
  let FP_ENDPOINT = sthis.env.get("FP_ENDPOINT");

  const testEnv = {
    [rt.sts.envKeyDefaults.PUBLIC]: keys.keys.strings.publicKey,
    STORAGE_URL: sthis.env.get("STORAGE_URL") ?? "http://localhost:9000/testbucket",
    ACCESS_KEY_ID: sthis.env.get("ACCESS_KEY_ID") ?? "minioadmin",
    SECRET_ACCESS_KEY: sthis.env.get("SECRET_ACCESS_KEY") ?? "minioadmin",
  };

  if (FP_ENDPOINT) {
    params = { port: 0 };
  } else {
    await fs.mkdir("dist", { recursive: true });

    $.verbose = !!sthis.env.get("FP_DEBUG");
    // create db
    await $`wrangler -c cloud/backend/cf-d1/wrangler.toml -e test d1  execute test-meta-merge --local --command "select 'meno'"`;
    // setup sql
    await $`npx drizzle-kit push --config ./cloud/backend/cf-d1/drizzle.cloud.d1-local.config.ts --force`;

    params = await setupBackendD1(sthis, "cloud/backend/cf-d1/wrangler.toml", "test");
    FP_ENDPOINT = `http://localhost:${params.port}`;
  }

  // const FP_STORAGE_URL = `fpcloud://localhost:${params.port}/?tenant=${sthis.nextId().str}&ledger=test-l&protocol=ws`;

  setTestEnv(project, {
    ...testEnv,
    // FP_STORAGE_URL,
    FP_ENDPOINT,
  });

  return () => {
    if (params.pid) {
      // eslint-disable-next-line no-console
      console.log("Stopping wrangler-backend process - ", params.pid);
      process.kill(params.pid);
    }
  };
}
