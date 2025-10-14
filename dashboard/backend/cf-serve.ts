import { drizzle } from "drizzle-orm/d1";
import { D1Database, Fetcher, Request as CFRequest, Response as CFResponse } from "@cloudflare/workers-types";
import { CORS, createHandler } from "./create-handler.js";
import { URI } from "@adviser/cement";
import { resWellKnownJwks } from "./well-known-jwks.js";

export interface Env {
  DB: D1Database;
  // CLERK_SECRET_KEY: string;
  ASSETS: Fetcher;
}
export default {
  async fetch(request: Request, env: Env) {
    const uri = URI.from(request.url);
    let ares: Promise<CFResponse>;
    console.log("cf-serve", uri.toString());
    switch (true) {
      case uri.pathname.startsWith("/api"):
        // console.log("cf-serve", request.url, env);
        ares = createHandler(drizzle(env.DB), env)(request) as unknown as Promise<CFResponse>;
        break;

      case uri.pathname.startsWith("/.well-known/jwks.json"):
        ares = resWellKnownJwks(request, env as unknown as Record<string, string>) as unknown as Promise<CFResponse>;
        break;
      case uri.pathname.startsWith("/fp-cloud-connector"):
      case uri.pathname.startsWith("/fp-logo.svg"):
      case uri.pathname.startsWith("/assets/"):
        console.log("cf-serve static", uri.pathname, request.url.toString());
        ares = env.ASSETS.fetch(request as unknown as CFRequest);
        break;
      default:
        ares = env.ASSETS.fetch(uri.build().pathname("/").asURL(), request as unknown as CFRequest);
    }
    const res = await ares;
    console.log("cf-serve done", uri.pathname, res.status);
    return new Response(res.body as ReadableStream<Uint8Array>, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        ...Object.fromEntries(res.headers.entries()),
        ...CORS,
      },
    });
  },
};
