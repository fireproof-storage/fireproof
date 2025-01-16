// deno run --unstable-sloppy-imports --allow-net --allow-read --allow-ffi  --allow-env  backend/deno-serve.ts
import { drizzle } from "drizzle-orm/d1";
import { D1Database } from "@cloudflare/workers-types";
import { createHandler } from "./create-handler.ts";

export interface Env {
  DB: D1Database;
}
export default {
  async fetch(request: Request, env: Env) {
    return createHandler(drizzle(env.DB))(request);
  },
};
