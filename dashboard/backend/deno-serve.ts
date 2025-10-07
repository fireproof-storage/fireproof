import { createClient } from "@libsql/client/node";
import { createHandler } from "./create-handler.js";
import { drizzle } from "drizzle-orm/libsql";

function getClient() {
  console.log(`file://${process.cwd()}/dist/sqlite.db`);
  const client = createClient({ url: `file://${process.cwd()}/dist/sqlite.db` });
  return drizzle(client);
}

function main() {
  Deno.serve({
    port: 7370,
    handler: createHandler(getClient(), Deno.env.toObject()),
  });
}

try {
  main();
} catch (err: unknown) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(error);
  Deno.exit(1);
}
