import { Hono } from "hono";
import { HonoServer } from "../hono-server.js";
import { NodeHonoFactory } from "./node-hono-server.js";
import { serve } from "@hono/node-server";
import { ensureSuperThis, ps } from "@fireproof/core";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

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
  const msgP = ps.cloud.defaultMsgParams(sthis, {
    hasPersistent: true,
  });
  const gestalt = ps.cloud.defaultGestalt(msgP, {
    id: "FP-Storage-Backend", // fpProtocol ? (fpProtocol === "http" ? "HTTP-server" : "WS-server") : "FP-CF-Server",
  });

  const honoServer = new HonoServer(
    new NodeHonoFactory(sthis, {
      msgP,
      gs: gestalt,
      sql: drizzle(createClient({ url: `file://${process.cwd()}/dist/sqlite.db` })),
      // new BetterSQLDatabase("./dist/node-meta.sqlite"),
    }),
  ).register(app);

  await honoServer.start();
  // eslint-disable-next-line no-console
  console.log("Listen on 8909");
  serve({
    fetch: app.fetch,
    port: 8909,
  });
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
