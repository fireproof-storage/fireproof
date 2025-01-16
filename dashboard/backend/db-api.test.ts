// import { describe } from 'vitest/globals';

// import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

// import Database from 'better-sqlite3';
// import { eq } from 'drizzle-orm';
// import { userRef } from "./db-api-schema";

import { createClient } from "@libsql/client/node";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { FPApiImpl, FPApiToken, OwnerTenant, ReqEnsureUserRef, ResEnsureUserRef, VerifiedAuth } from "./api.js";
import { ensureSuperThis, Result, SuperThis } from "@fireproof/core";
// // import { eq } from 'drizzle-orm'
// // import { drizzle } from 'drizzle-orm/libsql';
// // import Database from 'better-sqlite3';

// const client = createClient({
//   url: ''
// });
// export const db = drizzle(client);

// const users = sqliteTable('users', {
//   id: integer('id').primaryKey(),
//   name: text('full_name'),
// });

// // const sqlite = new Database('sqlite.db');
// // const db = drizzle({ client: sqlite });

// db.select().from(users).all();
// db.select().from(users).where(eq(users.id, 42)).get();

class TestApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }
  verify(token: string): Promise<Result<VerifiedAuth>> {
    const id = `userId-${token}`;
    return Promise.resolve(
      Result.Ok({
        type: "clerk",
        token,
        userId: id,
        provider: "Clerk",
        params: {
          email: `test${id}@test.de`,
          first: `first${id}`,
          last: `last${id}`,
          nick: `nick${id}`,
        },
      }),
    );
  }
}

describe("db-api", () => {
  // let db: BetterSQLite3Database
  let db: LibSQLDatabase;
  const sthis = ensureSuperThis();
  let fpApi: FPApiImpl;
  const data = [] as {
    reqs: ReqEnsureUserRef;
    ress: ResEnsureUserRef;
  }[];
  beforeAll(async () => {
    const client = createClient({ url: `file://${process.cwd()}/dist/sqlite.db` });
    db = drizzle(client);
    fpApi = new FPApiImpl(sthis, db, new TestApiToken(sthis));

    data.push(
      ...Array(10)
        .fill(0)
        .map((_, i) => ({
          ress: {} as ResEnsureUserRef,
          reqs: {
            type: "reqEnsureUserRef",
            auth: {
              token: `test-${i}-${sthis.nextId().str}`,
              type: "clerk",
            },
          } satisfies ReqEnsureUserRef,
        })),
    );
    for (const d of data) {
      const rRes = await fpApi.ensureUserRef(d.reqs!);
      const res = rRes.Ok();
      d.ress = res;
      expect(res).toEqual({
        authProvider: "Clerk",
        authUserId: `userId-${d.reqs.auth.token}`,
        createdAt: res.createdAt,
        maxTenants: 5,
        params: res.params,
        // "params": "{"email":"testuserId-test-0-zGy3ufenE@test.de","first":"firstuserId-test-0-zGy3ufenE","last":"lastuserId-test-0-zGy3ufenE","nick":"nickuserId-test-0-zGy3ufenE"}",
        tenants: res.tenants,
        type: "resEnsureUserRef",
        updatedAt: res.updatedAt,
        userRefId: res.userRefId,
      });
    }
  });
  it("check ensureUserRef", async () => {
    for (const d of data.map((d) => d.reqs)) {
      const rRes = await fpApi.ensureUserRef(d);
      const res = rRes.Ok();
      expect(res).toEqual({
        authProvider: "Clerk",
        authUserId: `userId-${d.auth.token}`,
        createdAt: res.createdAt,
        maxTenants: 5,
        params: res.params,
        tenants: res.tenants,
        type: "resEnsureUserRef",
        updatedAt: res.updatedAt,
        userRefId: res.userRefId,
      });
    }
  });
  it("should list tenants by user", async () => {
    for (const d of data) {
      const rRes = await fpApi.listTenantsByUser({
        type: "reqListTenantsByUser",
        auth: d.reqs.auth,
      });
      const res = rRes.Ok();
      const ownerTenant = d.ress.tenants[0] as OwnerTenant;
      expect(res).toEqual({
        authUserId: d.ress.authUserId,
        tenants: [
          {
            adminUserRefIds: ownerTenant.adminUserRefIds,
            memberUserRefIds: ownerTenant.memberUserRefIds,
            maxAdminUserRefs: 5,
            maxMemberUserRefs: 5,
            default: true,
            role: "owner",
            tenantId: d.ress.tenants[0].tenantId,
            name: d.ress.tenants[0].name,
            tenantName: d.ress.tenants[0].tenantName,
          },
        ],
        type: "resListTenantsByUser",
        userRefId: d.ress.userRefId,
      });
    }
  });
});
