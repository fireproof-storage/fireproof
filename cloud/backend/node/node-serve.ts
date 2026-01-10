import { Hono } from "hono";
import { HonoServer } from "@fireproof/cloud-backend-base";
import { NodeHonoFactory } from "./node-hono-server.js";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { defaultMsgParams } from "@fireproof/core-protocols-cloud";
import { defaultGestalt } from "@fireproof/core-types-protocols-cloud";

// async function main() {
//   Deno.serve({
//     port: 7370,
//     handler: createHandler(getClient(), Deno.env.toObject()),
//   });
// }

// main().catch((err) => {
//   console.error(err);
//   Deno.exit(1);
// });

async function main() {
  const app = new Hono();
  const sthis = ensureSuperThis();
  const msgP = defaultMsgParams(sthis, {
    hasPersistent: true,
  });
  const gestalt = defaultGestalt(msgP, {
    id: "FP-Storage-Backend", // fpProtocol ? (fpProtocol === "http" ? "HTTP-server" : "WS-server") : "FP-CF-Server",
  });

  // Health check endpoint
  app.get("/", (c) => c.json({ status: "ok" }));
  app.get("/health", (c) => c.json({ status: "ok" }));

  const sqliteUrl = process.env.FP_SQLITE_URL || `${process.cwd()}/dist/sqlite.db`;
  const factory = new NodeHonoFactory(sthis, {
    msgP,
    gs: gestalt,
    sql: drizzle(createClient({ url: `file://${sqliteUrl}` })),
  });

  // Register routes and start with the SAME app instance for WebSocket to work
  new HonoServer(factory).register(app);
  await factory.start(app);
  await factory.serve(app, 8909);

  // eslint-disable-next-line no-console
  console.log("Listen on 8909");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

// export default {
//   fetch: async (req, env, ctx): Promise<Response> => {
//     // console.log("fetch-1", req.url);
//     await honoServer.start();
//     // await honoServer.register(app);
//     // console.log("fetch-2", req.url);
//     return app.fetch(req, env, ctx);
//   },
// } satisfies ExportedHandler<Env>;
