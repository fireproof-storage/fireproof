import alchemy from "alchemy";
import {
  AccountApiToken,
  AccountId,
  Assets,
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
  Worker,
} from "alchemy/cloudflare";
import type { FPRoomDurableObject } from "../cloud/backend/cf-d1/server.ts";

const app = await alchemy("fireproof-cloud", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD,
});

const stage = app.stage; // dev | staging | production

// -- Account ID (for R2 S3 endpoint) --
const accountId = await AccountId();

// -- R2 Bucket: blob storage --
const fpStorage = await R2Bucket("fp-storage", {
  name: `fp-storage-${stage}`,
  adopt: true,
  empty: true,
  cors: [
    {
      allowed: {
        origins: ["*"],
        methods: ["GET", "PUT", "DELETE", "HEAD"],
        headers: ["*"],
      },
      exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
      maxAgeSeconds: 86400,
    },
  ],
});

// -- R2 S3 API Token (for pre-signed URLs) --
const r2Token = await AccountApiToken("r2-s3-token", {
  name: `fp-r2-s3-${stage}`,
  policies: [
    {
      effect: "allow",
      permissionGroups: ["Workers R2 Storage Write"],
      resources: {
        "com.cloudflare.api.account": "*",
      },
    },
  ],
});

const storageUrl = `https://${accountId}.r2.cloudflarestorage.com/fp-storage-${stage}`;

// -- D1: cloud-backend metadata --
const backendDb = await D1Database("fp-backend-d1", {
  name: `fp-meta-${stage}`,
  migrationsDir: "./cloud/backend/cf-d1/migrations",
  adopt: true,
});

// -- D1: dashboard --
// Migrations generated via predeploy script
const dashboardDb = await D1Database("fp-connect-db", {
  name: `fp-connect-${stage}`,
  migrationsDir: "./dashboard/backend/dist",
  adopt: true,
});

// -- Durable Object: WebSocket rooms --
const wsRoom = DurableObjectNamespace<FPRoomDurableObject>("FPRoomDurableObject", {
  className: "FPRoomDurableObject",
});

// -- Cloud Backend Worker --
const cloudBackend = await Worker("cloud-backend", {
  name: `fireproof-cloud-${stage}`,
  entrypoint: "./cloud/backend/cf-d1/server.ts",
  compatibilityDate: "2025-02-24",
  adopt: true,
  bindings: {
    FP_STORAGE: fpStorage,
    FP_BACKEND_D1: backendDb,
    FP_WS_ROOM: wsRoom,
    VERSION: "FP-MSG-1.0",
    FP_DEBUG: stage === "production" ? "false" : "true",
    MAX_IDLE_TIME: "300",
    CLOUD_SESSION_TOKEN_PUBLIC: alchemy.secret(process.env.CLOUD_SESSION_TOKEN_PUBLIC!),
    STORAGE_URL: storageUrl,
    ACCESS_KEY_ID: r2Token.accessKeyId,
    SECRET_ACCESS_KEY: r2Token.secretAccessKey,
    REGION: "auto",
  },
  url: true,
  observability: { enabled: true },
});

// -- Dashboard Worker --
const dashboardAssets = await Assets({
  path: "./dashboard/frontend/dist/static/client",
});

const dashboardDomains =
  stage === "production" ? ["connect.fireproof.direct"] : undefined;

const dashboard = await Worker("dashboard", {
  name: `fireproof-dashboard-${stage}`,
  entrypoint: "./dashboard/backend/cf-serve.ts",
  compatibilityDate: "2025-02-24",
  adopt: true,
  bindings: {
    DB: dashboardDb,
    ASSETS: dashboardAssets,
    ENVIRONMENT: stage,
    CLERK_PUBLISHABLE_KEY: alchemy.secret(process.env.CLERK_PUBLISHABLE_KEY!),
    CLERK_PUB_JWT_URL: alchemy.secret(process.env.CLERK_PUB_JWT_URL!),
    CLOUD_SESSION_TOKEN_PUBLIC: alchemy.secret(process.env.CLOUD_SESSION_TOKEN_PUBLIC!),
    CLOUD_SESSION_TOKEN_SECRET: alchemy.secret(process.env.CLOUD_SESSION_TOKEN_SECRET!),
    DEVICE_ID_CA_PRIV_KEY: alchemy.secret(process.env.DEVICE_ID_CA_PRIV_KEY!),
    DEVICE_ID_CA_CERT: alchemy.secret(process.env.DEVICE_ID_CA_CERT!),
    MAX_TENANTS: process.env.MAX_TENANTS ?? "100",
    MAX_ADMIN_USERS: process.env.MAX_ADMIN_USERS ?? "10",
    MAX_MEMBER_USERS: process.env.MAX_MEMBER_USERS ?? "50",
    MAX_INVITES: process.env.MAX_INVITES ?? "100",
    MAX_LEDGERS: process.env.MAX_LEDGERS ?? "50",
  },
  assets: {
    html_handling: "force-trailing-slash",
  },
  url: true,
  domains: dashboardDomains,
});

await app.finalize();

// -- Output --
console.log(`\n--- Deployed URLs ---`);
console.log(`Stage: ${stage}`);
console.log(`Cloud Backend: ${cloudBackend.url}`);
console.log(`Dashboard: ${dashboard.url}`);
if (stage === "production") {
  console.log(`Dashboard Domain: https://connect.fireproof.direct`);
}
console.log(`\nVITE_CLERK_PUBLISHABLE_KEY=${process.env.CLERK_PUBLISHABLE_KEY}`);
console.log(`VITE_API_URL=${dashboard.url}`);
console.log(`VITE_CLOUD_URL=${cloudBackend.url}`);
