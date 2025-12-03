import { defineConfig } from "drizzle-kit";
import fs from "fs";

fs.mkdirSync("./dist", { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./meta-merger/schema.ts",
  out: "./dist",
  dbCredentials: {
    url: "./dist/cloud-backend-meta-merger.sqlite",
  },
});
