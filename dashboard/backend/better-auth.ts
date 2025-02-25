//BETTER-OFFimport { betterAuth } from "better-auth";
//BETTER-OFFimport { jwt } from "better-auth/plugins";
//BETTER-OFFimport { createClient } from "@libsql/client/node";
//BETTER-OFF// import Database from "better-sqlite3";
//BETTER-OFFimport { LibsqlDialect } from "@libsql/kysely-libsql";
//BETTER-OFF
//BETTER-OFFfunction socialProviders() {
//BETTER-OFF  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
//BETTER-OFF    return {};
//BETTER-OFF  }
//BETTER-OFF  return {
//BETTER-OFF    github: {
//BETTER-OFF      clientId: process.env.GITHUB_CLIENT_ID,
//BETTER-OFF      clientSecret: process.env.GITHUB_CLIENT_SECRET,
//BETTER-OFF    },
//BETTER-OFF  };
//BETTER-OFF}
//BETTER-OFF
//BETTER-OFFexport const auth = betterAuth({
//BETTER-OFF  // database: {
//BETTER-OFF  //   db: createClient({ url: `file://${process.cwd()}/dist/sqlite.db` }),
//BETTER-OFF  //   type: "sqlite" // or "mysql", "postgres" or "mssql"
//BETTER-OFF  // },
//BETTER-OFF
//BETTER-OFF  database: new LibsqlDialect({
//BETTER-OFF    client: createClient({ url: `file://${process.cwd()}/dist/sqlite.db` }),
//BETTER-OFF  }),
//BETTER-OFF
//BETTER-OFF  // database: "./dist/sqlite.db",
//BETTER-OFF  // dialect: "mysql",
//BETTER-OFF  // host: "localhost",
//BETTER-OFF  // new Database("./dist/sqlite.db"),
//BETTER-OFF  trustedOrigins: ["http://localhost:3000", "http://localhost:4711", "http://localhost:7373", "http://127.0.0.1:7373"],
//BETTER-OFF  plugins: [
//BETTER-OFF    jwt({
//BETTER-OFF      jwt: {
//BETTER-OFF        definePayload: (user) => {
//BETTER-OFF          return {
//BETTER-OFF            params: {
//BETTER-OFF              email: user.user.email,
//BETTER-OFF              email_verified: user.user.email_verified,
//BETTER-OFF              first: user.user.given_name,
//BETTER-OFF              image_url: user.user.image_url,
//BETTER-OFF              last: user.user.family_name,
//BETTER-OFF              // "name": user.user.
//BETTER-OFF              // "public_meta": {}
//BETTER-OFF            },
//BETTER-OFF            sub: user.user.id,
//BETTER-OFF            userId: user.user.id,
//BETTER-OFF          };
//BETTER-OFF        },
//BETTER-OFF      },
//BETTER-OFF    }),
//BETTER-OFF  ],
//BETTER-OFF  emailAndPassword: {
//BETTER-OFF    enabled: true,
//BETTER-OFF  },
//BETTER-OFF  socialProviders: socialProviders(),
//BETTER-OFF});
