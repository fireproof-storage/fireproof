// deno run --unstable-sloppy-imports --allow-net --allow-read --allow-ffi  --allow-env  backend/deno-serve.ts
import { drizzle } from "drizzle-orm/d1";
import { D1Database, Fetcher, Request as CFRequest } from "@cloudflare/workers-types";
import { createHandler } from "./create-handler.ts";

export interface Env {
  DB: D1Database;
  CLERK_SECRET_KEY: string;
  ASSETS: Fetcher;
}
export default {
  async fetch(request: CFRequest, env: Env) {
    const ret = await createHandler(drizzle(env.DB), env)(request as unknown as Request);
    if (ret.ok) {
      return ret;
    }
    // if (!ret) {
    //   return env.A
    // }
    return env.ASSETS.fetch(request);
  },
};
