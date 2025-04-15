import { SuperThis } from "@fireproof/core";
import { portRandom } from "../node/test-helper.js";
import { $ } from "zx";
import { Future } from "@adviser/cement";

export async function setupBackendD1(
  sthis: SuperThis,
  wranglerToml: string,
  env: string,
  port = portRandom(sthis),
): Promise<{ port: number; pid?: number; envName: string }> {
  const envName = `test`;
  if (process.env.FP_WRANGLER_PORT) {
    return Promise.resolve({ port: +process.env.FP_WRANGLER_PORT, pid: 0, envName });
  }

  $.verbose = !!sthis.env.get("FP_DEBUG");
  // process.env["FP_STORAGE_URL"] = `fpcloud://localhost:${port}/?tenant=${sthis.nextId().str}&ledger=test-l&protocol=ws`;
  await $`npx tsx cli/main.ts writeEnv --wranglerToml ${wranglerToml} --env ${env} --doNotOverwrite`;

  const runningWrangler = $`
                   wrangler dev -c ${wranglerToml} --port ${port} --env ${envName} --no-show-interactive-dev-session --no-live-reload &
                   waitPid=$!
                   echo "PID:$waitPid"
                   wait $waitPid`;
  const waitReady = new Future();
  let pid: number | undefined;
  runningWrangler.stdout.on("data", (chunk) => {
    // console.log(">>", chunk.toString())
    const mightPid = chunk.toString().match(/PID:(\d+)/)?.[1];
    if (mightPid) {
      pid = +mightPid;
    }
    if (chunk.includes("Starting local serv")) {
      waitReady.resolve(true);
    }
  });
  runningWrangler.stderr.on("data", (chunk) => {
    // eslint-disable-next-line no-console
    console.error("!!", chunk.toString());
  });
  await waitReady.asPromise();
  return { port, pid, envName };
}
