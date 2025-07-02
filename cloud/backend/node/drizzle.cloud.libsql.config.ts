import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../base/meta-merger/schema.ts",
  out: "./dist",
  dbCredentials: {
    url: "./dist/cloud-backend-node.sqlite",
  },
});
