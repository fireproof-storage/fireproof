import { defineConfig } from "drizzle-kit";
import { dotenv } from "zx";

for (const varName of [".env.local", ".dev.vars", "../frontend/.env.local", "../frontend/.dev.vars"]) {
  try {
    dotenv.config(varName);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`Could not load environment variables from ${varName}`);
  }
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
}

if (!process.env.CLOUDFLARE_DATABASE_ID) {
  throw new Error("CLOUDFLARE_DATABASE_ID is not set");
}

if (!process.env.CLOUDFLARE_D1_TOKEN && !process.env.CLOUDFLARE_API_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn("CLOUDFLARE_D1_TOKEN is not set, using CLOUDFLARE_API_TOKEN instead. This may not work as expected.");
}

export default defineConfig({
  dialect: "sqlite",
  schema: "../backend/db-api-schema.ts",
  out: "./dist",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    token: (process.env.CLOUDFLARE_D1_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN) as string,
  },
});
