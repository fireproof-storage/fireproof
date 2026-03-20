import { R2Bucket } from "@cloudflare/workers-types";
interface Env {
  BUCKET: R2Bucket;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, HEAD",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    // eslint-disable-next-line no-restricted-globals
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\//, "");

    if (request.method === "HEAD") {
      const obj = await env.BUCKET.head(key);
      if (!obj) return new Response(null, { status: 404, headers: CORS_HEADERS });
      return new Response(null, { status: 200, headers: { ...CORS_HEADERS, etag: obj.etag } });
    }

    if (request.method === "GET") {
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
      return new Response(obj.body as never, {
        status: 200,
        headers: { ...CORS_HEADERS, etag: obj.etag, "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
      });
    }

    if (request.method === "PUT") {
      await env.BUCKET.put(key, request.body as never);
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  },
};
