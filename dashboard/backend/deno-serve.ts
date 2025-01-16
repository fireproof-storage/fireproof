// deno run --unstable-sloppy-imports --allow-net --allow-read --allow-ffi  --allow-env  backend/deno-serve.ts
import { createClient } from "@libsql/client/node";
import { createHandler } from "./create-handler.ts";
import { drizzle } from "drizzle-orm/libsql";

function getClient() {
  console.log(`file://${process.cwd()}/dist/sqlite.db`);
  const client = createClient({ url: `file://${process.cwd()}/dist/sqlite.db` });
  return drizzle(client);
}

async function main() {
  Deno.serve({
    port: 7370,
    handler: createHandler(getClient()),
  });
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
