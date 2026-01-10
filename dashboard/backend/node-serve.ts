// Node.js server for Fireproof Dashboard
// Run with: node dist/node-serve.js
import { createClient } from "@libsql/client/node";
import { createHandler, DefaultHttpHeaders } from "./create-handler.js";
import { drizzle } from "drizzle-orm/libsql";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { resWellKnownJwks } from "./well-known-jwks.js";

const PORT = parseInt(process.env.PORT || "7370", 10);
const STATIC_DIR = process.env.STATIC_DIR || join(process.cwd(), "../frontend/dist/static/client");

function getClient() {
  const dbPath = process.env.DB_PATH || `${process.cwd()}/dist/sqlite.db`;
  console.log(`Database path: file://${dbPath}`);
  const client = createClient({ url: `file://${dbPath}` });
  return drizzle(client);
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

function serveStatic(pathname: string): { content: Buffer; contentType: string } | null {
  let filePath = join(STATIC_DIR, pathname);

  // Default to index.html for directory requests
  if (pathname === "/" || !extname(pathname)) {
    filePath = join(STATIC_DIR, "index.html");
  }

  if (!existsSync(filePath)) {
    // Try index.html for SPA routing
    filePath = join(STATIC_DIR, "index.html");
    if (!existsSync(filePath)) {
      return null;
    }
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return { content, contentType };
  } catch {
    return null;
  }
}

async function main() {
  const db = getClient();
  const env = process.env as Record<string, string>;
  const handler = await createHandler(db, env);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = url.pathname;

    console.log(`${req.method} ${pathname}`);

    try {
      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        const headers = DefaultHttpHeaders();
        Object.entries(headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
        res.writeHead(200);
        res.end();
        return;
      }

      // API routes
      if (pathname.startsWith("/api")) {
        const body: Buffer[] = [];
        for await (const chunk of req) {
          body.push(chunk);
        }
        const bodyStr = Buffer.concat(body).toString();

        const request = new Request(url.toString(), {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: ["POST", "PUT", "PATCH"].includes(req.method || "") ? bodyStr : undefined,
        });

        const response = await handler(request);
        const responseBody = await response.text();

        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        res.writeHead(response.status);
        res.end(responseBody);
        return;
      }

      // JWKS endpoint
      if (pathname === "/.well-known/jwks.json") {
        const request = new Request(url.toString(), {
          method: req.method,
          headers: req.headers as HeadersInit,
        });
        const response = await resWellKnownJwks(request, env);
        const responseBody = await response.text();

        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        res.writeHead(response.status);
        res.end(responseBody);
        return;
      }

      // Static files
      const staticFile = serveStatic(pathname);
      if (staticFile) {
        res.setHeader("Content-Type", staticFile.contentType);
        res.writeHead(200);
        res.end(staticFile.content);
        return;
      }

      // 404
      res.writeHead(404);
      res.end("Not Found");
    } catch (error) {
      console.error("Request error:", error);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Dashboard server listening on http://0.0.0.0:${PORT}`);
    console.log(`Static files from: ${STATIC_DIR}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
