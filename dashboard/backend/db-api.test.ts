// import { describe } from 'vitest/globals';

// import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

// import Database from 'better-sqlite3';
// import { eq } from 'drizzle-orm';
// import { userRef } from "./db-api-schema";

import { createClient } from "@libsql/client/node";
import { drizzle, LibSQLDatabase } from "drizzle-orm/libsql";
import { FPApiSQL, FPApiToken, AdminTenant, ReqEnsureUser, ResEnsureUser } from "./api.js";
import { ensureSuperThis, SuperThis } from "@fireproof/core";
import { AuthType, VerifiedAuth } from "./users.ts";
import { queryEmail, queryNick, QueryUser } from "./sql-helper.ts";
import { jwtVerify } from "jose/jwt/verify";
import { env2jwk } from "./jwk-helper.ts";
import { Result } from "@adviser/cement";
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
  let fpApi: FPApiSQL;
  const data = [] as {
    reqs: ReqEnsureUser;
    ress: ResEnsureUser;
  }[];
  beforeAll(async () => {
    const client = createClient({ url: `file://${process.cwd()}/dist/sqlite.db` });
    db = drizzle(client);
    fpApi = new FPApiSQL(sthis, db, { clerk: new TestApiToken(sthis) });

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
      const rRes = await fpApi.ensureUser(d.reqs!);
      const res = rRes.Ok();
      d.ress = res;
      // console.log("res", res);
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
            adminUserIds: [res.user.userId],
            default: true,
            maxAdminUsers: 5,
            maxMemberUsers: 5,
            memberUserIds: [],
            role: "admin",
            tenantId: res.tenants[0].tenantId,
            user: res.tenants[0].user,
            tenant: res.tenants[0].tenant,
          },
        ],
      });
    }
  });
  it("check ensureUser", async () => {
    for (const d of data.map((d) => d.reqs)) {
      const rRes = await fpApi.ensureUser(d);
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
            adminUserIds: [res.user.userId],
            default: true,
            maxAdminUsers: 5,
            maxMemberUsers: 5,
            memberUserIds: [],
            role: "admin",
            tenantId: res.tenants[0].tenantId,
            user: res.tenants[0].user,
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
      const ownerTenant = d.ress.tenants[0] as AdminTenant;
      expect(res).toEqual({
        authUserId: d.ress.user.byProviders[0].providerUserId,
        tenants: [
          {
            user: d.ress.tenants[0].user,
            tenant: d.ress.tenants[0].tenant,
            adminUserIds: ownerTenant.adminUserIds,
            memberUserIds: ownerTenant.memberUserIds,
            maxAdminUsers: 5,
            maxMemberUsers: 5,
            default: true,
            role: "admin",
            tenantId: d.ress.tenants[0].tenantId,
          },
        ],
        type: "resListTenantsByUser",
        userId: d.ress.user.userId,
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
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          existingUserId: data[0].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
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
        query: {
          existingUserId: "not-existing",
        },
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
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
        query: {
          existingUserId: data[1].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
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
        // invitedLedgerId: undefined,
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
            role: "member",
          },
        },
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        invitedUserId: data[1].ress.user.userId,
        inviterUserId: data[0].ress.user.userId,
        query: {
          andProvider: undefined,
          byEmail: undefined,
          byNick: undefined,
          existingUserId: data[1].ress.user.userId,
        },
        status: "pending",
        statusReason: "just invited",
        sendEmailCount: 0,
        updatedAt: resinsert.Ok().invite.updatedAt,
        // userID: data[1].ress.user.userId,
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
        query: {
          byEmail: key,
        },
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    expect(resinsert.isOk()).toBeTruthy();
    const resupdate = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        inviteId: resinsert.Ok().invite.inviteId,
        incSendEmailCount: true,
        query: {
          // to be ignored
          byEmail: `test@${sthis.nextId().str}.de`,
          byNick: `nick${sthis.nextId().str}`,
        },
        invitedParams: {
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
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
        // invitedLedgerId: undefined,
        invitedParams: {
          ledger: undefined,
          tenant: {
            id: data[0].ress.tenants[0].tenantId,
            role: "member",
          },
        },
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        inviterUserId: data[0].ress.user.userId,
        query: {
          andProvider: undefined,
          byEmail: queryEmail(key),
          byNick: undefined,
          existingUserId: undefined,
        },
        sendEmailCount: 1,
        status: "pending",
        statusReason: "just invited",
        updatedAt: resupdate.Ok().invite.updatedAt,
        userID: undefined,
      },
      type: "resInviteUser",
    });
  });

  it("invite non existing user to a ledger", async () => {});

  it("try find an user by string(email)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query: {
        byString: data[0].ress.user.byProviders[0].cleanEmail,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: data[0].ress.user.byProviders[0].cleanEmail,
      },
      results: [data[0].ress.user],
    });
  });

  it("try find an user by string(nick)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query: {
        byString: data[0].ress.user.byProviders[0].cleanNick,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: data[0].ress.user.byProviders[0].cleanNick,
      },
      results: [data[0].ress.user],
    });
  });

  it("try find an user by string(userId)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query: {
        byString: data[0].ress.user.userId,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: data[0].ress.user.userId,
      },
      results: [data[0].ress.user],
    });
  });

  it("try find a existing user", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query: {
        byEmail: "exact@email.com",
        byNick: "exactnick",
        andProvider: "fp",
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
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
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [data[0].ress.user],
    });
  });

  it("find a per email", async () => {
    const query = {
      byEmail: data[0].ress.user.byProviders[0].cleanEmail,
    };
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [data[0].ress.user],
    });
  });

  it("find a per nick", async () => {
    const query = {
      byNick: data[0].ress.user.byProviders[0].cleanNick,
    };
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: data[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [data[0].ress.user],
    });
  });

  it("CRUD tenant", async () => {
    const tenant = await fpApi.createTenant({
      type: "reqCreateTenant",
      auth: data[0].reqs.auth,
      tenant: {
        // ownerUserId: data[0].ress.user.userId,
      },
    });
    expect(tenant.Ok()).toEqual({
      tenant: {
        createdAt: tenant.Ok().tenant.createdAt,
        maxAdminUsers: 5,
        maxInvites: 10,
        maxLedgers: 5,
        maxMemberUsers: 5,
        name: tenant.Ok().tenant.name,
        ownerUserId: data[0].ress.user.userId,
        status: "active",
        statusReason: "just created",
        tenantId: tenant.Ok().tenant.tenantId,
        updatedAt: tenant.Ok().tenant.updatedAt,
      },
      type: "resCreateTenant",
    });
    const rUpdate = await fpApi.updateTenant({
      type: "reqUpdateTenant",
      auth: data[0].reqs.auth,
      tenant: {
        tenantId: tenant.Ok().tenant.tenantId,
        name: "new name",
      },
    });
    expect(rUpdate.isOk()).toBeTruthy();

    const listOwnersTenant = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: data[0].reqs.auth,
    });
    const myOwnersTenant = listOwnersTenant.Ok().tenants.filter((i) => i.tenantId === tenant.Ok().tenant.tenantId);
    expect(myOwnersTenant.length).toEqual(1);
    expect(myOwnersTenant[0]).toEqual({
      adminUserIds: [data[0].ress.user.userId],
      default: false,
      maxAdminUsers: 5,
      maxMemberUsers: 5,
      memberUserIds: [],
      user: myOwnersTenant[0].user,
      role: "admin",
      tenant: {
        ...myOwnersTenant[0].tenant,
        name: "new name",
      },
      tenantId: tenant.Ok().tenant.tenantId,
    });
    const invite = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth: data[0].reqs.auth,
      ticket: {
        query: {
          existingUserId: data[1].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            id: tenant.Ok().tenant.tenantId,
            role: "member",
          },
        },
      },
    });
    const rRedeem = await fpApi.redeemInvite({
      type: "reqRedeemInvite",
      auth: data[1].reqs.auth,
    });
    expect(rRedeem.isOk()).toBeTruthy();
    const rRedeemedInvites = rRedeem.Ok().invites?.find((i) => i.inviteId === invite.Ok().invite.inviteId)!;
    expect(rRedeemedInvites).toEqual({
      createdAt: rRedeemedInvites.createdAt,
      expiresAfter: rRedeemedInvites.expiresAfter,
      inviteId: rRedeemedInvites.inviteId,
      invitedParams: {
        tenant: {
          id: rRedeemedInvites.invitedParams.tenant?.id,
          role: "member",
        },
      },
      invitedUserId: data[1].ress.user.userId,
      inviterUserId: rRedeemedInvites.inviterUserId,
      query: {
        andProvider: undefined,
        byEmail: undefined,
        byNick: undefined,
        existingUserId: rRedeemedInvites.query.existingUserId,
      },
      sendEmailCount: 0,
      status: "accepted",
      statusReason: rRedeemedInvites.statusReason,
      updatedAt: rRedeemedInvites.updatedAt,
    });

    const listInvites = await fpApi.listInvites({
      type: "reqListInvites",
      auth: data[0].reqs.auth,
      tenantIds: [tenant.Ok().tenant.tenantId],
    });

    expect(
      listInvites.Ok().tickets.filter((i) => i.inviteId === rRedeemedInvites.inviteId),

      // .tickets.filter((i) => i.invitedParams.tenant?.id === rUpdate.Ok().tenant.tenantId)
      // .filter((i) => i.inviteId === invite.Ok().invite.inviteId),
    ).toEqual([
      {
        createdAt: rRedeemedInvites.createdAt,
        expiresAfter: rRedeemedInvites.expiresAfter,
        inviteId: rRedeemedInvites.inviteId,
        invitedParams: {
          tenant: {
            id: rRedeemedInvites.invitedParams.tenant?.id,
            role: "member",
          },
        },
        invitedUserId: rRedeemedInvites.invitedUserId,
        inviterUserId: rRedeemedInvites.inviterUserId,
        query: {
          andProvider: undefined,
          byEmail: undefined,
          byNick: undefined,
          existingUserId: rRedeemedInvites.query.existingUserId,
        },
        sendEmailCount: 0,
        status: "accepted",
        statusReason: rRedeemedInvites.statusReason,
        updatedAt: rRedeemedInvites.updatedAt,
      },
    ]);

    const tenantWithNew = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: data[1].reqs.auth,
    });
    const myWith = tenantWithNew.Ok().tenants.filter((i) => i.tenantId === tenant.Ok().tenant.tenantId);
    expect(myWith).toEqual([
      {
        default: false,
        user: {
          ...myWith[0].user,
          name: "invited from [new name]",
        },

        role: "member",
        tenant: {
          ...myWith[0].tenant,
          name: "new name",
        },
        tenantId: tenant.Ok().tenant.tenantId,
      },
    ]);
    const rDelete = await fpApi.deleteTenant({
      type: "reqDeleteTenant",
      auth: data[0].reqs.auth,
      tenantId: tenant.Ok().tenant.tenantId,
    });
    expect(rDelete.isOk()).toBeTruthy();
    const tenantWithoutNew = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: data[0].reqs.auth,
    });
    expect(tenantWithoutNew.Ok().tenants.filter((i) => i.tenantId === tenant.Ok().tenant.tenantId).length).toBe(0);

    const tickets = await fpApi.listInvites({
      type: "reqListInvites",
      auth: data[0].reqs.auth,
      tenantIds: [tenant.Ok().tenant.tenantId],
    });
    expect(
      tickets
        .Ok()
        .tickets.filter((i) => i.invitedParams.tenant?.id === rUpdate.Ok().tenant.tenantId)
        .map((i) => i.inviteId === invite.Ok().invite.inviteId),
    ).toEqual([]);
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
              query: {
                existingUserId: data[0].ress.user.userId,
              },
              invitedParams: {
                tenant: {
                  id: d.ress.tenants[0].tenantId,
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
        tenantIds: [data.slice(3)[didx].ress.tenants[0].tenantId],
        // .map((i) => i.ress.tenants[0].tenantId),
      });
      expect(res.Ok()).toEqual({
        type: "resListInvites",
        tickets: [invites[didx]],
      });
    }
    await Promise.all(
      data.slice(3).map(async (d, didx) => {
        return fpApi.deleteInvite({ type: "reqDeleteInvite", auth: d.reqs.auth, inviteId: invites[didx].inviteId });
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

  it("CRUD an ledger", async () => {
    const createLedger = await fpApi.createLedger({
      type: "reqCreateLedger",
      auth: data[0].reqs.auth,
      ledger: {
        tenantId: data[0].ress.tenants[0].tenantId,
        name: `ledger[${data[0].ress.tenants[0].tenantId}]`,
      },
    });
    expect(createLedger.Ok()).toEqual({
      ledger: {
        createdAt: createLedger.Ok().ledger.createdAt,
        ledgerId: createLedger.Ok().ledger.ledgerId,
        maxShares: 5,
        name: `ledger[${data[0].ress.tenants[0].tenantId}]`,
        ownerId: data[0].ress.user.userId,
        users: [
          {
            createdAt: createLedger.Ok().ledger.users[0].createdAt,
            default: false,
            name: `ledger[${data[0].ress.tenants[0].tenantId}]`,
            right: "write",
            role: "admin",
            updatedAt: createLedger.Ok().ledger.users[0].updatedAt,
            userId: data[0].ress.user.userId,
          },
        ],
        tenantId: data[0].ress.tenants[0].tenantId,
        updatedAt: createLedger.Ok().ledger.updatedAt,
      },
      type: "resCreateLedger",
    });
    const rUpdate = await fpApi.updateLedger({
      type: "reqUpdateLedger",
      auth: data[0].reqs.auth,
      ledger: {
        name: "new name",
        right: "read",
        role: "member",
        default: true,
        ledgerId: createLedger.Ok().ledger.ledgerId,
        tenantId: data[0].ress.tenants[0].tenantId,
      },
    });
    expect(rUpdate.isOk()).toBeTruthy();

    const listOwnersLedger = await fpApi.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: data[0].reqs.auth,
    });
    const myOwnersLedger = listOwnersLedger.Ok().ledgers.filter((i) => i.ledgerId === createLedger.Ok().ledger.ledgerId);
    expect(myOwnersLedger.length).toEqual(1);
    expect(myOwnersLedger[0]).toEqual({
      createdAt: createLedger.Ok().ledger.createdAt,
      ledgerId: createLedger.Ok().ledger.ledgerId,
      maxShares: 5,
      name: "new name",
      ownerId: data[0].ress.user.userId,
      users: [
        {
          createdAt: createLedger.Ok().ledger.users[0].createdAt,
          default: true,
          name: "new name",
          right: "read",
          role: "member",
          updatedAt: rUpdate.Ok().ledger.updatedAt,
          userId: data[0].ress.user.userId,
        },
      ],
      tenantId: data[0].ress.tenants[0].tenantId,
      updatedAt: rUpdate.Ok().ledger.updatedAt,
    });

    const rDelete = await fpApi.deleteLedger({
      type: "reqDeleteLedger",
      auth: data[0].reqs.auth,
      ledger: {
        ledgerId: createLedger.Ok().ledger.ledgerId,
        tenantId: data[0].ress.tenants[0].tenantId,
      },
    });

    const afterListOwnersLedger = await fpApi.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: data[0].reqs.auth,
    });
    const myAfterDelete = afterListOwnersLedger.Ok().ledgers.filter((i) => i.ledgerId === createLedger.Ok().ledger.ledgerId);
    expect(myAfterDelete.length).toEqual(0);
  });

  it("create session with claim", async () => {
    const auth: AuthType = data[0].reqs.auth;
    // fpApi.sthis.env.set("CLOUD_SESSION_TOKEN_SECRET", "

    const rledger = await fpApi.createLedger({
      type: "reqCreateLedger",
      auth: data[0].reqs.auth,
      ledger: {
        tenantId: data[0].ress.tenants[0].tenantId,
        name: `Session Ledger`,
      },
    });
    await fpApi.updateLedger({
      type: "reqUpdateLedger",
      auth: data[0].reqs.auth,
      ledger: {
        ledgerId: rledger.Ok().ledger.ledgerId,
        tenantId: data[0].ress.tenants[0].tenantId,
        name: `Session X-Ledger`,
        right: "read",
        role: "member",
      },
    });

    const resSt = await fpApi.getCloudSessionToken(
      {
        type: "reqCloudSessionToken",
        auth,
      },
      {
        secretToken:
          "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",
        issuer: "TEST_I",
        audience: "TEST_A",
        validFor: 40000000,
      },
    );
    expect(resSt.isOk()).toBeTruthy();
    const pub = await env2jwk(
      "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
    );
    const v = await jwtVerify(resSt.Ok().token, pub);
    expect(v.payload.exp).toBeLessThanOrEqual(new Date().getTime() + 3700000);
    expect(v.payload).toEqual({
      aud: "TEST_A",
      exp: v.payload.exp,
      iat: v.payload.iat,
      iss: "TEST_I",
      ledgers: [
        {
          id: rledger.Ok().ledger.ledgerId,
          right: "read",
          role: "member",
        },
      ],
      tenants: [
        {
          id: data[0].ress.tenants[0].tenantId,
          role: "admin",
        },
      ],
      userId: data[0].ress.user.userId,
    });
    await fpApi.deleteLedger({
      type: "reqDeleteLedger",
      auth: data[0].reqs.auth,
      ledger: {
        ledgerId: rledger.Ok().ledger.ledgerId,
        tenantId: data[0].ress.tenants[0].tenantId,
      },
    });
  });
});

it("queryEmail strips +....@", async () => {
  expect(queryEmail("a.C@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+bla@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+huhu+@b.de")).toBe("achuhu@b.de");
  expect(queryEmail("a.C+huhu+bla@b.de")).toBe("achuhu@b.de");
});
