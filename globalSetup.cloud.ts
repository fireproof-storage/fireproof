import { cloudBackendParams, setupBackend } from "./cloud-backend/test-helper.js";
import { ensureSuperThis } from "./src/utils.js";

const sthis = ensureSuperThis();
export async function setup() {
  const params = await setupBackend(sthis);
  process.env[`FP_TEST_CF_BACKEND`] = JSON.stringify(params);
  // eslint-disable-next-line no-console
  console.log("Started wrangler process - ", cloudBackendParams(sthis).pid);
}

export async function teardown() {
  // eslint-disable-next-line no-console
  console.log("Stopping wrangler process - ", cloudBackendParams(sthis).pid);
  process.kill(cloudBackendParams(sthis).pid);
}
