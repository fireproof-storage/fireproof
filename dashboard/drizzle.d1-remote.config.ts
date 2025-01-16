import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

// console.log(process.env)

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.ts",
  out: "./dist",
  driver: "d1-http",
  tablesFilter: ["/^(?!.*_cf_KV).*$/"],
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
