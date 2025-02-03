import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { createClient } from "@libsql/client/node";
// import Database from "better-sqlite3";
import { LibsqlDialect } from "@libsql/kysely-libsql";

export const auth = betterAuth({
  database: new LibsqlDialect({
    client: createClient({ url: `file://${process.cwd()}/dist/sqlite.db` }),
  }),
  // database: "./dist/sqlite.db",
  // dialect: "mysql",
  // host: "localhost",
  // new Database("./dist/sqlite.db"),
  trustedOrigins: ["http://localhost:3000", "http://localhost:4711", "http://localhost:7373", "http://127.0.0.1:7373"],
  plugins: [
    jwt({
      jwt: {
        definePayload: (user) => {
          return {
            params: {
              email: user.user.email,
              email_verified: user.user.email_verified,
              first: user.user.given_name,
              image_url: user.user.image_url,
              last: user.user.family_name,
              // "name": user.user.
              // "public_meta": {}
            },
            sub: user.user.id,
            userId: user.user.id,
          };
        },
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
});
