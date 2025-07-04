import { defineConfig } from "drizzle-kit";
import { dotenv } from "zx";

dotenv.config(".env.local");

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/db-api-schema.js",
  out: "./dist",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN! ?? process.env.CLOUDFLARE_API_TOKEN!,
  },
});
