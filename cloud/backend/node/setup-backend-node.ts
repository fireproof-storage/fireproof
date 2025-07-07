import { portRandom, HonoServer } from "@fireproof/cloud-backend-base";
import { SuperThis } from "@fireproof/core-types-base";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { Hono } from "hono";
import { NodeHonoFactory } from "./node-hono-server.js";

export async function setupBackendNode(
  sthis: SuperThis,
  dbfile: LibSQLDatabase<Record<string, never>>,
  // backend: "D1" | "DO",
  // key: string,
  port = portRandom(sthis),
): Promise<{ port: number; pid: number; envName: string; hs: HonoServer }> {
  const envName = `test`;
  if (process.env.FP_WRANGLER_PORT) {
    return Promise.resolve({ port: +process.env.FP_WRANGLER_PORT, pid: 0, envName, hs: {} as HonoServer });
  }

  const nhf = new NodeHonoFactory(sthis, {
    // msgP,
    // gs: remoteGestalt,
    sql: dbfile,
    //new BetterSQLDatabase("./dist/node-meta.sqlite"),
  });
  const app = new Hono();
  const hs = new HonoServer(nhf);
  await hs.start().then((srv) => srv.once(app, port));
  return { port, pid: 0, envName, hs };
}
