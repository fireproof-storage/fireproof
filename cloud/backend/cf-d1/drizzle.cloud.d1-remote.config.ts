import { defineConfig } from "drizzle-kit";

import { dotenv } from "zx";
import { envFactory, param } from "@adviser/cement";

dotenv.config(process.env.FP_ENV ?? ".dev.env");

function dbCredentials() {
  const env = envFactory();
  const out = env.gets({
    CLOUDFLARE_ACCOUNT_ID: param.REQUIRED,
    CLOUDFLARE_DATABASE_ID: param.REQUIRED,
    CLOUDFLARE_D1_TOKEN: param.OPTIONAL,
    CLOUDFLARE_API_TOKEN: param.OPTIONAL,
  });
  if (out.isErr()) {
    throw out.Err();
  }
  if (!out.Ok().CLOUDFLARE_D1_TOKEN && !out.Ok().CLOUDFLARE_API_TOKEN) {
    throw new Error("Either CLOUDFLARE_D1_TOKEN or CLOUDFLARE_API_TOKEN must be set");
  }
  return {
    accountId: out.Ok().CLOUDFLARE_ACCOUNT_ID,
    databaseId: out.Ok().CLOUDFLARE_DATABASE_ID,
    token: out.Ok().CLOUDFLARE_D1_TOKEN ?? out.Ok().CLOUDFLARE_API_TOKEN,
  };
}

export default defineConfig({
  schema: "./cloud/backend/meta-merger/schema.ts",
  out: "./dist",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: dbCredentials(),
});
