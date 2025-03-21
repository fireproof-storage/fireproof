import { HonoServer } from "./cloud/backend/hono-server.js";
import { mockJWK, setupBackend } from "./cloud/backend/test-helper.js";
import { ensureSuperThis } from "./src/utils.js";

const sthis = ensureSuperThis();
let hs: HonoServer;
export async function setup() {
  const keys = await mockJWK({}, sthis);

  process.env["CLOUD_SESSION_TOKEN_PUBLIC"] = keys.keys.strings.publicKey;
  process.env["STORAGE_URL"] = "http://localhost:9000/testbucket";
  process.env["ACCESS_KEY_ID"] = "minioadmin";
  process.env["SECRET_ACCESS_KEY"] = "minioadmin";

  const params = await setupBackend(sthis);
  hs = params.hs;
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
  /*
  // eslint-disable-next-line no-console
  console.log("Stopping node-backend process - ", cloudBackendParams(sthis).pid);
  */
  hs.close();
}
