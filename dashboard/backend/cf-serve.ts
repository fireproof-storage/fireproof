import { drizzle } from "drizzle-orm/d1";
import { D1Database, Fetcher, Request as CFRequest } from "@cloudflare/workers-types";
import { createHandler } from "./create-handler.ts";
import { URI } from "@adviser/cement";

export interface Env {
  DB: D1Database;
  // CLERK_SECRET_KEY: string;
  ASSETS: Fetcher;
}
export default {
  async fetch(request: Request, env: Env) {
    const uri = URI.from(request.url);
    switch (true) {
      case uri.pathname.startsWith("/api"):
        console.log("cf-serve", request.url, env);
        const ret = await createHandler(drizzle(env.DB), env)(request);
        if (ret.ok) {
          return ret;
        }
      case uri.pathname.startsWith("/fp-logo.svg"):
      case uri.pathname.startsWith("/assets/"):
        return env.ASSETS.fetch(request as unknown as CFRequest);
      default:
        return env.ASSETS.fetch(uri.build().pathname("/").asURL(), request as unknown as CFRequest);
    }
  },
};
