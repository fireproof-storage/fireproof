// import { describe } from 'vitest/globals';

// import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

// import Database from 'better-sqlite3';
// import { eq } from 'drizzle-orm';
// import { userRef } from "./db-api-schema";

import { createClient } from "@libsql/client/node";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { FPApiImpl, FPApiToken, OwnerTenant, ReqEnsureUser, ResEnsureUser } from "./api.js";
import { ensureSuperThis, Result, SuperThis } from "@fireproof/core";
import { AuthType, VerifiedAuth } from "./users.ts";
import { queryEmail, queryNick, QueryUser } from "./sql-helper.ts";
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
          name: `nick${id}`,
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
    reqs: ReqEnsureUser;
    ress: ResEnsureUser;
  }[];
  beforeAll(async () => {
    const client = createClient({ url: `file://${process.cwd()}/dist/sqlite.db` });
    db = drizzle(client);
    fpApi = new FPApiImpl(sthis, db, new TestApiToken(sthis));

    data.push(
      ...Array(10)
        .fill(0)
        .map((_, i) => ({
          ress: {} as ResEnsureUser,
          reqs: {
            type: "reqEnsureUser",
            auth: {
              token: `test-${i}-${sthis.nextId().str}`,
              type: "clerk",
            },
          } satisfies ReqEnsureUser,
        })),
    );
    for (const d of data) {
      const rRes = await fpApi.ensureUserRef(d.reqs!);
      const res = rRes.Ok();
      d.ress = res;
      expect(res).toEqual({
        type: "resEnsureUser",
        user: {
          byProviders: [
            {
              cleanEmail: res.user.byProviders[0].cleanEmail,
              cleanNick: res.user.byProviders[0].cleanNick,
              createdAt: res.user.byProviders[0].createdAt,
              params: res.user.byProviders[0].params,
              providerUserId: `userId-${d.reqs.auth.token}`,
              queryEmail: queryEmail(res.user.byProviders[0].cleanEmail),
              queryNick: queryNick(res.user.byProviders[0].cleanNick),
              queryProvider: "github",
              updatedAt: res.user.byProviders[0].updatedAt,
              used: res.user.byProviders[0].used,
            },
          ],
          createdAt: res.user.createdAt,
          maxTenants: 10,
          status: "active",
          statusReason: "just created",
          updatedAt: res.user.updatedAt,
          userId: res.user.userId,
        },
        tenants: [
          {
            adminUserRefIds: [res.user.userId],
            default: true,
            maxAdminUserRefs: 5,
            maxMemberUserRefs: 5,
            memberUserRefIds: [],
            name: res.tenants[0].name,
            role: "owner",
            tenantId: res.tenants[0].tenantId,
            tenantName: res.tenants[0].tenantName,
            ref: res.tenants[0].ref,
            tenant: res.tenants[0].tenant,
          },
        ],
      });
    }
  });
  it("check ensureUserRef", async () => {
    for (const d of data.map((d) => d.reqs)) {
      const rRes = await fpApi.ensureUserRef(d);
      const res = rRes.Ok();
      expect(res).toEqual({
        type: "resEnsureUser",
        user: {
          byProviders: [
            {
              cleanEmail: res.user.byProviders[0].cleanEmail,
              cleanNick: res.user.byProviders[0].cleanNick,
              createdAt: res.user.byProviders[0].createdAt,
              params: res.user.byProviders[0].params,
              providerUserId: `userId-${d.auth.token}`,
              queryEmail: queryEmail(res.user.byProviders[0].cleanEmail),
              queryNick: queryNick(res.user.byProviders[0].cleanNick),
              queryProvider: "github",
              updatedAt: res.user.byProviders[0].updatedAt,
              used: res.user.byProviders[0].used,
            },
          ],
          createdAt: res.user.createdAt,
          maxTenants: 10,
          status: "active",
          statusReason: "just created",
          updatedAt: res.user.updatedAt,
          userId: res.user.userId,
        },
        tenants: [
          {
            adminUserRefIds: [res.user.userId],
            default: true,
            maxAdminUserRefs: 5,
            maxMemberUserRefs: 5,
            memberUserRefIds: [],
            name: res.tenants[0].name,
            role: "owner",
            tenantId: res.tenants[0].tenantId,
            tenantName: res.tenants[0].tenantName,
            ref: res.tenants[0].ref,
            tenant: res.tenants[0].tenant,
          },
        ],
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
        authUserId: d.ress.user.byProviders[0].providerUserId,
        tenants: [
          {
            ref: d.ress.tenants[0].ref,
            tenant: d.ress.tenants[0].tenant,
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
        userRefId: d.ress.user.userId,
      });
    }
  });

  it("invite to self", async () => {
    const auth: AuthType = data[0].reqs.auth;
    // const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          existingUserId: data[0].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            // id: data[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    expect(resinsert.Err().message).toEqual("cannot invite self");
  });

  it("invite to not existing id", async () => {
    const auth: AuthType = data[0].reqs.auth;
    // const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          existingUserId: "not-existing",
        },
        invitedParams: {
          tenant: {
            // id: data[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    expect(resinsert.Err().message).toEqual("existingUserId not found");
  });

  it("invite existing user to a tenant", async () => {
    const auth: AuthType = data[0].reqs.auth;
    // const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          existingUserId: data[1].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            // id: data[0].ress.tenants[0].tenantId,
            role: "member",
          },
        },
      },
    });
    expect(resinsert.Ok()).toEqual({
      invite: {
        createdAt: resinsert.Ok().invite.createdAt,
        expiresAfter: resinsert.Ok().invite.expiresAfter,
        inviteId: resinsert.Ok().invite.inviteId,
        invitedLedgerId: undefined,
        invitedParams: {
          tenant: {
            role: "member",
          },
        },
        invitedTenantId: data[0].ress.tenants[0].tenantId,
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        inviterUserRefId: data[0].ress.user.userId,
        queryEmail: undefined,
        queryNick: undefined,
        queryProvider: undefined,
        sendEmailCount: 0,
        updatedAt: resinsert.Ok().invite.updatedAt,
        userID: data[1].ress.user.userId,
      },
      type: "resInviteUser",
    });
  });

  it("invite non existing user to a tenant", async () => {
    const auth: AuthType = data[0].reqs.auth;
    const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          byEmail: key,
        },
        invitedParams: {
          tenant: {
            // id: data[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    const resupdate = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviteId: resinsert.Ok().invite.inviteId,
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        incSendEmailCount: true,
        query: {
          // to be ignored
          byEmail: `test@${sthis.nextId().str}.de`,
          byNick: `nick${sthis.nextId().str}`,
        },
        invitedParams: {
          tenant: {
            role: "member",
          },
        },
      },
    });

    expect(resinsert.Ok().invite.createdAt.getTime()).toBeLessThan(resupdate.Ok().invite.expiresAfter.getTime());
    expect(resupdate.Ok()).toEqual({
      invite: {
        createdAt: resinsert.Ok().invite.createdAt,
        expiresAfter: resinsert.Ok().invite.expiresAfter,
        inviteId: resinsert.Ok().invite.inviteId,
        invitedLedgerId: undefined,
        invitedParams: {
          tenant: {
            role: "member",
          },
        },
        invitedTenantId: data[0].ress.tenants[0].tenantId,
        inviterTenantId: data[0].ress.tenants[0].tenantId,
        inviterUserRefId: data[0].ress.user.userId,
        queryEmail: queryEmail(key),
        queryNick: undefined,
        queryProvider: undefined,
        sendEmailCount: 1,
        updatedAt: resupdate.Ok().invite.updatedAt,
        userID: undefined,
      },
      type: "resInviteUser",
    });
  });

  it("invite non existing user to a ledger", async () => {});

  it("try find a existing user", async () => {
    const res = await fpApi.findUserRef({
      type: "reqFindUserRef",
      auth: data[0].reqs.auth,
      query: {
        byEmail: "exact@email.com",
        byNick: "exactnick",
        andProvider: "fp",
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUserRef",
      query: {
        andProvider: "fp",
        byEmail: "exact@email.com",
        byNick: "exactnick",
      },
      results: [],
    });
  });

  it("find by id", async () => {
    const query = {
      existingUserId: data[0].ress.user.userId,
    } satisfies QueryUser;
    const res = await fpApi.findUserRef({
      type: "reqFindUserRef",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUserRef",
      query,
      results: [data[0].ress.user],
    });
  });

  it("find a per email", async () => {
    const query = {
      byEmail: data[0].ress.user.byProviders[0].cleanEmail,
    };
    const res = await fpApi.findUserRef({
      type: "reqFindUserRef",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUserRef",
      query,
      results: [data[0].ress.user],
    });
  });

  it("find a per nick", async () => {
    const query = {
      byNick: data[0].ress.user.byProviders[0].cleanNick,
    };
    const res = await fpApi.findUserRef({
      type: "reqFindUserRef",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUserRef",
      query,
      results: [data[0].ress.user],
    });
  });

  it("listInvites with a user with all tenants", async () => {});

  it("listInvites with one tenant per user", async () => {
    const invites = await Promise.all(
      data.slice(3).map(async (d) => {
        return (
          await fpApi.inviteUser({
            type: "reqInviteUser",
            auth: d.reqs.auth,
            ticket: {
              inviterTenantId: d.ress.tenants[0].tenantId,
              query: {
                existingUserId: data[0].ress.user.userId,
              },
              invitedParams: {
                tenant: {
                  // id: data[0].ress.tenants[0].tenantId,
                  role: "member",
                },
              },
            },
          })
        ).Ok().invite;
      }),
    );
    for (let didx = 0; didx < data.length - 3; ++didx) {
      const d = data[didx + 3];
      const res = await fpApi.listInvites({
        type: "reqListInvites",
        auth: d.reqs.auth,
        tenantIds: data.slice(3).map((i) => i.ress.tenants[0].tenantId),
      });
      expect(res.Ok()).toEqual({
        type: "resListInvites",
        tickets: [
          {
            invites: [invites[didx]],
            tenantId: d.ress.tenants[0].tenantId,
          },
        ],
      });
    }
    await Promise.all(
      data.slice(3).map(async (d, didx) => {
        return fpApi.removeInvite({ type: "reqRemoveInvite", auth: d.reqs.auth, inviteId: invites[didx].inviteId });
      }),
    );
    for (let didx = 0; didx < data.length - 3; ++didx) {
      const d = data[didx + 3];
      const res = await fpApi.listInvites({
        type: "reqListInvites",
        auth: d.reqs.auth,
        tenantIds: data.slice(3).map((i) => i.ress.tenants[0].tenantId),
      });
      expect(res.Ok()).toEqual({
        type: "resListInvites",
        tickets: [],
      });
    }
  });
});

it("queryEmail strips +....@", async () => {
  expect(queryEmail("a.C@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+bla@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+huhu+@b.de")).toBe("achuhu@b.de");
  expect(queryEmail("a.C+huhu+bla@b.de")).toBe("achuhu@b.de");
});
