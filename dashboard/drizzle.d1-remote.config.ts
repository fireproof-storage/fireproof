import { defineConfig } from "drizzle-kit";
import { dotenv } from "zx";

dotenv.config(".env.local");

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID is not set in .env.local");
}

if (!process.env.CLOUDFLARE_DATABASE_ID) {
  throw new Error("CLOUDFLARE_DATABASE_ID is not set in .env.local");
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error("CLOUDFLARE_D1_TOKEN or CLOUDFLARE_API_TOKEN is not set in .env.local");
}

if (!process.env.CLOUDFLARE_D1_TOKEN && process.env.CLOUDFLARE_API_TOKEN) {
  console.warn("CLOUDFLARE_D1_TOKEN is not set, using CLOUDFLARE_API_TOKEN instead. This may not work as expected.");
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.js",
  out: "./dist",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    token: process.env.CLOUDFLARE_D1_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN,
  },
});
