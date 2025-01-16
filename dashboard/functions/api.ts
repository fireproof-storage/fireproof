// deno run --unstable-sloppy-imports --allow-net --allow-read --allow-ffi  --allow-env  backend/deno-serve.ts
import { drizzle } from "drizzle-orm/d1";
import { D1Database } from "@cloudflare/workers-types";
import { createHandler } from "../backend/create-handler.ts";

export interface Env {
  DB: D1Database;
}
export function onRequest(ctx) {
  console.log(ctx);
  return createHandler(drizzle(ctx.env.DB))(ctx.request);
}
