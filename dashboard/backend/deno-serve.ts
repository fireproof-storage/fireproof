// deno run --unstable-sloppy-imports --allow-net --allow-read --allow-ffi  --allow-env  backend/deno-serve.ts
import { createClient } from "@libsql/client/node";
import { createHandler } from "./create-handler.ts";
import { drizzle } from "drizzle-orm/libsql";

async function getClient() {
  const dbPath = `dist/sqlite.db`;
  console.log(`libsql opening file: ${dbPath}`);
  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client);
  // debug list tables
  try {
    const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table';");
    console.log('Tables:', res.rows);
  } catch (e) {
    console.error('Error listing tables', e);
  }
  return db;
}

async function main() {
  const port = 7370;
  const env = Deno.env.toObject();
  // Basic sanity check of critical env vars for easier debugging
  const requiredKeys = [
    "CLERK_PUB_JWT_KEY",
    "CLOUD_SESSION_TOKEN_PUBLIC",
    "CLOUD_SESSION_TOKEN_SECRET",
  ];
  for (const k of requiredKeys) {
    const present = env[k] && env[k].length > 0;
    console.log(`ENV ${k}: ${present ? "✅ present" : "❌ MISSING"}`);
  }
  console.log(`SQLite DB: file://${process.cwd()}/dist/sqlite.db`);
  console.log(`Starting backend on http://localhost:${port}/`);

  // Start server and keep process alive until it is closed
  const db = await getClient();
  const server = Deno.serve({
    port,
    handler: createHandler(db, env),
  });
  console.log("Backend ready – waiting for requests…");
  await server.finished;
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
