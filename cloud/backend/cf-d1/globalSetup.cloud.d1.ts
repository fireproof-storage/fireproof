import fs from "fs/promises";
import { cloudBackendParams, mockJWK } from "../node/test-helper.js";
import { ensureSuperThis } from "@fireproof/core";
import { $ } from "zx";
import { setupBackendD1 } from "./setup-backend-d1.js";

const sthis = ensureSuperThis();
export async function setup() {
  const keys = await mockJWK({}, sthis);

  process.env["CLOUD_SESSION_TOKEN_PUBLIC"] = keys.keys.strings.publicKey;
  process.env["STORAGE_URL"] = "http://localhost:9000/testbucket";
  process.env["ACCESS_KEY_ID"] = "minioadmin";
  process.env["SECRET_ACCESS_KEY"] = "minioadmin";

  await fs.mkdir("dist", { recursive: true });

  $.verbose = true;
  // create db
  await $`wrangler -c cloud/backend/cf-d1/wrangler.toml -e test d1  execute test-meta-merge --local --command "select 'meno'"`;
  // setup sql
  await $`npx drizzle-kit push --config ./cloud/backend/cf-d1/drizzle.cloud.d1.config.ts --force`;

  process.env["FP_TEST_SQL_URL"] = `file://${process.cwd()}/dist/node-meta.sqlite`;

  const params = await setupBackendD1(sthis, keys, "cloud/backend/cf-d1/wrangler.toml", "test");
  process.env[`FP_TEST_CLOUD_BACKEND`] = JSON.stringify({
    port: params.port,
    pid: params.pid,
    envName: params.envName,
  });

  process.env.FP_STORAGE_URL = keys
    .applyAuthToURI(`fpcloud://localhost:${params.port}/?tenant=${sthis.nextId().str}&ledger=test-l&protocol=ws`)
    .toString();

  /*
  // eslint-disable-next-line no-console
  console.log("Started node-backend process - ", cloudBackendParams(sthis).pid, "on port", params.port);
  */
}

export async function teardown() {
  // eslint-disable-next-line no-console
  console.log("Stopping wrangler-backend process - ", cloudBackendParams(sthis).pid);
  process.kill(cloudBackendParams(sthis).pid);
}
