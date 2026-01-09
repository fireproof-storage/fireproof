// import { describe } from 'vitest/globals';

// import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

// import Database from 'better-sqlite3';
// import { eq } from 'drizzle-orm';
// import { userRef } from "./db-api-schema";

import { Result, WithoutPromise } from "@adviser/cement";
import { SuperThis, Subject, CertificatePayloadSchema } from "@fireproof/core-types-base";
import { createClient } from "@libsql/client/node";
import { type LibSQLDatabase, drizzle } from "drizzle-orm/libsql";
import { jwtVerify } from "jose/jwt/verify";
import { FPApiSQL } from "../api.js";
import {
  ResCreateLedger,
  UserTenant,
  type AdminTenant,
  type DashAuthType,
  type QueryUser,
  type ReqEnsureUser,
  type ResEnsureUser,
  type VerifiedAuth,
} from "@fireproof/core-protocols-dashboard";
import { queryEmail, queryNick } from "../sql/sql-helper.js";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { describe, beforeAll, expect, it, inject } from "vitest";
import { resWellKnownJwks } from "../well-known-jwks.js";
import { DeviceIdCA, DeviceIdKey, DeviceIdCSR } from "@fireproof/core-device-id";
import { FPCloudClaim } from "@fireproof/core-types-protocols-cloud";
import { FPApiToken } from "../types.js";

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

async function createTestDeviceCA(sthis: SuperThis): Promise<DeviceIdCA> {
  const caKey = await DeviceIdKey.create();
  const caSubject: Subject = {
    commonName: "Test Device CA",
    organization: "Test Organization",
    locality: "Test City",
    stateOrProvinceName: "Test State",
    countryName: "US",
  };

  return new DeviceIdCA({
    base64: sthis.txt.base64,
    caKey,
    caSubject,
    actions: {
      generateSerialNumber: async () => sthis.nextId(32).str,
    },
  });
}

describe("db-api", () => {
  // let db: BetterSQLite3Database
  let db: LibSQLDatabase;
  const sthis = ensureSuperThis();
  let fpApi: FPApiSQL;
  const datas = [] as {
    reqs: ReqEnsureUser;
    ress: ResEnsureUser;
  }[];
  // const logger = ensureLogger(sthis, "dashboard-backend-db-api-test");
  let deviceCA: DeviceIdCA;

  async function jwkPackage() {
    // const pair = await SessionTokenService.generateKeyPair();
    const jwtTestOpts = {
      secretToken:
        "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",
      publicToken:
        "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
      issuer: "TEST_I",
      audience: "TEST_A",
      validFor: 40000000,
    };
    const jwkTestPub = (await sts.env2jwk(jwtTestOpts.publicToken, "ES256"))[0];
    // let jwkTestPub: CryptoKey;
    return {
      opts: jwtTestOpts,
      pub: jwkTestPub,
    };
  }
  beforeAll(async () => {
    const url = inject("DASH_FP_TEST_SQL_URL" as never) as string;
    const client = createClient({ url });
    db = drizzle(client);

    deviceCA = await createTestDeviceCA(sthis);

    fpApi = new FPApiSQL(
      sthis,
      db,
      { clerk: new TestApiToken(sthis) },
      {
        cloudPublicKeys: [],
        clerkPublishableKey: "test-clerk-publishable-key",
        maxTenants: 10,
        maxAdminUsers: 5,
        maxMemberUsers: 5,
        maxInvites: 10,
        maxLedgers: 5,
        maxAppIdBindings: 5,
        deviceCA,
      },
    );

    datas.push(
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
    for (const d of datas) {
      const rRes = await fpApi.ensureUser(d.reqs);
      const res = rRes.Ok();
      d.ress = res;
      // console.log("res", res);
      expect(res).toStrictEqual({
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
  it("check listTenantsByUser", async () => {
    const d = datas[0];
    const rRes = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: d.reqs.auth,
    });
    const res = rRes.Ok();
    expect(res).toStrictEqual({
      authUserId: res.authUserId,
      tenants: [
        {
          adminUserIds: (res.tenants[0] as AdminTenant).adminUserIds,
          default: true,
          memberUserIds: [],
          role: "admin",
          tenant: {
            createdAt: res.tenants[0].tenant.createdAt,
            limits: {
              maxAdminUsers: 5,
              maxInvites: 10,
              maxLedgers: 5,
              maxMemberUsers: 5,
            },
            name: res.tenants[0].tenant.name,
            status: "active",
            statusReason: "just created",
            updatedAt: res.tenants[0].tenant.updatedAt,
          },
          tenantId: res.tenants[0].tenantId,
          user: {
            createdAt: res.tenants[0].user.createdAt,
            limits: {
              maxTenants: 10,
            },
            name: res.tenants[0].user.name,
            status: "active",
            statusReason: "just created",
            updatedAt: res.tenants[0].user.updatedAt,
          },
        },
      ],
      type: "resListTenantsByUser",
      userId: res.userId,
    });
  });
  it("check ensureUser", async () => {
    for (const data of datas) {
      const d = data.reqs;
      const rRes = await fpApi.ensureUser(d);
      const res = rRes.Ok();
      expect(res).toEqual({
        type: "resEnsureUser",
        user: {
          byProviders: [
            {
              cleanEmail: data.ress.user.byProviders[0].cleanEmail,
              cleanNick: data.ress.user.byProviders[0].cleanNick,
              createdAt: data.ress.user.byProviders[0].createdAt,
              params: data.ress.user.byProviders[0].params,
              providerUserId: `userId-${d.auth.token}`,
              queryEmail: queryEmail(data.ress.user.byProviders[0].cleanEmail),
              queryNick: queryNick(data.ress.user.byProviders[0].cleanNick),
              queryProvider: "github",
              updatedAt: data.ress.user.byProviders[0].updatedAt,
              used: data.ress.user.byProviders[0].used,
            },
          ],
          createdAt: data.ress.user.createdAt,
          maxTenants: 10,
          status: "active",
          statusReason: "just created",
          updatedAt: data.ress.user.updatedAt,
          userId: data.ress.user.userId,
        },
        tenants: [
          {
            adminUserIds: [data.ress.user.userId],
            default: true,
            memberUserIds: [],
            role: "admin",
            tenantId: data.ress.tenants[0].tenantId,
            user: data.ress.tenants[0].user,
            tenant: data.ress.tenants[0].tenant,
          },
        ],
      });
    }
  });
  it("should list tenants by user", async () => {
    for (const d of datas) {
      const rRes = await fpApi.listTenantsByUser({
        type: "reqListTenantsByUser",
        auth: d.reqs.auth,
      });
      const res = rRes.Ok();
      const ownerTenant = d.ress.tenants[0] as AdminTenant;
      expect(res).toStrictEqual({
        authUserId: d.ress.user.byProviders[0].providerUserId,
        tenants: [
          {
            user: d.ress.tenants[0].user,
            tenant: d.ress.tenants[0].tenant,
            adminUserIds: ownerTenant.adminUserIds,
            memberUserIds: ownerTenant.memberUserIds,
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
    const auth: DashAuthType = datas[0].reqs.auth;
    // const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        query: {
          existingUserId: datas[0].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            id: datas[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    expect(resinsert.Err().message).toEqual("cannot invite self");
  });

  it("invite to not existing id", async () => {
    const auth: DashAuthType = datas[0].reqs.auth;
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
            id: datas[0].ress.tenants[0].tenantId,
            role: "admin",
          },
        },
      },
    });
    expect(resinsert.Err().message).toEqual("existingUserId not found");
  });

  it("invite existing user to a tenant", async () => {
    const auth: DashAuthType = datas[0].reqs.auth;
    // const key = `test@${sthis.nextId().str}.de`;
    const resinsert = await fpApi.inviteUser({
      type: "reqInviteUser",
      auth,
      ticket: {
        query: {
          existingUserId: datas[1].ress.user.userId,
        },
        invitedParams: {
          tenant: {
            id: datas[0].ress.tenants[0].tenantId,
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
            id: datas[0].ress.tenants[0].tenantId,
            role: "member",
          },
        },
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        invitedUserId: datas[1].ress.user.userId,
        inviterUserId: datas[0].ress.user.userId,
        query: {
          andProvider: undefined,
          byEmail: undefined,
          byNick: undefined,
          existingUserId: datas[1].ress.user.userId,
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
    const auth: DashAuthType = datas[0].reqs.auth;
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
            id: datas[0].ress.tenants[0].tenantId,
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
            id: datas[0].ress.tenants[0].tenantId,
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
            id: datas[0].ress.tenants[0].tenantId,
            role: "member",
          },
        },
        // inviterTenantId: data[0].ress.tenants[0].tenantId,
        inviterUserId: datas[0].ress.user.userId,
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

  it("invite non existing user to a ledger", async () => {
    /* */
  });

  it("try find an user by string(email)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query: {
        byString: datas[0].ress.user.byProviders[0].cleanEmail,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: datas[0].ress.user.byProviders[0].cleanEmail,
      },
      results: [datas[0].ress.user],
    });
  });

  it("try find an user by string(nick)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query: {
        byString: datas[0].ress.user.byProviders[0].cleanNick,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: datas[0].ress.user.byProviders[0].cleanNick,
      },
      results: [datas[0].ress.user],
    });
  });

  it("try find an user by string(userId)", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query: {
        byString: datas[0].ress.user.userId,
      },
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query: {
        byString: datas[0].ress.user.userId,
      },
      results: [datas[0].ress.user],
    });
  });

  it("try find a existing user", async () => {
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
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
      existingUserId: datas[0].ress.user.userId,
    } satisfies QueryUser;
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [datas[0].ress.user],
    });
  });

  it("find a per email", async () => {
    const query = {
      byEmail: datas[0].ress.user.byProviders[0].cleanEmail,
    };
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [datas[0].ress.user],
    });
  });

  it("find a per nick", async () => {
    const query = {
      byNick: datas[0].ress.user.byProviders[0].cleanNick,
    };
    const res = await fpApi.findUser({
      type: "reqFindUser",
      auth: datas[0].reqs.auth,
      query,
    });
    expect(res.Ok()).toEqual({
      type: "resFindUser",
      query,
      results: [datas[0].ress.user],
    });
  });

  it("CRUD tenant", async () => {
    const tenant = await fpApi.createTenant({
      type: "reqCreateTenant",
      auth: datas[0].reqs.auth,
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
        ownerUserId: datas[0].ress.user.userId,
        status: "active",
        statusReason: "just created",
        tenantId: tenant.Ok().tenant.tenantId,
        updatedAt: tenant.Ok().tenant.updatedAt,
      },
      type: "resCreateTenant",
    });
    const rUpdate = await fpApi.updateTenant({
      type: "reqUpdateTenant",
      auth: datas[0].reqs.auth,
      tenant: {
        tenantId: tenant.Ok().tenant.tenantId,
        name: "new name",
      },
    });
    expect(rUpdate.isOk()).toBeTruthy();

    const listOwnersTenant = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: datas[0].reqs.auth,
    });
    const myOwnersTenant = listOwnersTenant.Ok().tenants.filter((i) => i.tenantId === tenant.Ok().tenant.tenantId);
    expect(myOwnersTenant.length).toEqual(1);
    expect(myOwnersTenant[0]).toEqual({
      adminUserIds: [datas[0].ress.user.userId],
      default: false,
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
      auth: datas[0].reqs.auth,
      ticket: {
        query: {
          existingUserId: datas[1].ress.user.userId,
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
      auth: datas[1].reqs.auth,
    });
    expect(rRedeem.isOk()).toBeTruthy();
    const rRedeemedInvites = rRedeem.Ok().invites?.find((i) => i.inviteId === invite.Ok().invite.inviteId);
    if (!rRedeemedInvites) {
      throw new Error("Redeemed invite not found");
    }
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
      invitedUserId: datas[1].ress.user.userId,
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
      auth: datas[0].reqs.auth,
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
      auth: datas[1].reqs.auth,
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
      auth: datas[0].reqs.auth,
      tenantId: tenant.Ok().tenant.tenantId,
    });
    expect(rDelete.isOk()).toBeTruthy();
    const tenantWithoutNew = await fpApi.listTenantsByUser({
      type: "reqListTenantsByUser",
      auth: datas[0].reqs.auth,
    });
    expect(tenantWithoutNew.Ok().tenants.filter((i) => i.tenantId === tenant.Ok().tenant.tenantId).length).toBe(0);

    const tickets = await fpApi.listInvites({
      type: "reqListInvites",
      auth: datas[0].reqs.auth,
      tenantIds: [tenant.Ok().tenant.tenantId],
    });
    expect(
      tickets
        .Ok()
        .tickets.filter((i) => i.invitedParams.tenant?.id === rUpdate.Ok().tenant.tenantId)
        .map((i) => i.inviteId === invite.Ok().invite.inviteId),
    ).toEqual([]);
  });

  it("listInvites with a user with all tenants", async () => {
    /* */
  });

  it("listInvites with one tenant per user", async () => {
    const invites = await Promise.all(
      datas.slice(3).map(async (d) => {
        return (
          await fpApi.inviteUser({
            type: "reqInviteUser",
            auth: d.reqs.auth,
            ticket: {
              query: {
                existingUserId: datas[0].ress.user.userId,
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
    for (let didx = 0; didx < datas.length - 3; ++didx) {
      const d = datas[didx + 3];
      const res = await fpApi.listInvites({
        type: "reqListInvites",
        auth: d.reqs.auth,
        tenantIds: [datas.slice(3)[didx].ress.tenants[0].tenantId],
        // .map((i) => i.ress.tenants[0].tenantId),
      });
      expect(res.Ok()).toEqual({
        type: "resListInvites",
        tickets: [invites[didx]],
      });
    }
    await Promise.all(
      datas.slice(3).map(async (d, didx) => {
        return fpApi.deleteInvite({ type: "reqDeleteInvite", auth: d.reqs.auth, inviteId: invites[didx].inviteId });
      }),
    );
    for (let didx = 0; didx < datas.length - 3; ++didx) {
      const d = datas[didx + 3];
      const res = await fpApi.listInvites({
        type: "reqListInvites",
        auth: d.reqs.auth,
        tenantIds: datas.slice(3).map((i) => i.ress.tenants[0].tenantId),
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
      auth: datas[0].reqs.auth,
      ledger: {
        tenantId: datas[0].ress.tenants[0].tenantId,
        name: `ledger[${datas[0].ress.tenants[0].tenantId}]`,
      },
    });
    expect(createLedger.Ok()).toEqual({
      ledger: {
        createdAt: createLedger.Ok().ledger.createdAt,
        ledgerId: createLedger.Ok().ledger.ledgerId,
        maxShares: 5,
        name: `ledger[${datas[0].ress.tenants[0].tenantId}]`,
        ownerId: datas[0].ress.user.userId,
        users: [
          {
            createdAt: createLedger.Ok().ledger.users[0].createdAt,
            default: false,
            name: `ledger[${datas[0].ress.tenants[0].tenantId}]`,
            right: "write",
            role: "admin",
            updatedAt: createLedger.Ok().ledger.users[0].updatedAt,
            userId: datas[0].ress.user.userId,
          },
        ],
        tenantId: datas[0].ress.tenants[0].tenantId,
        updatedAt: createLedger.Ok().ledger.updatedAt,
      },
      type: "resCreateLedger",
    });
    const rUpdate = await fpApi.updateLedger({
      type: "reqUpdateLedger",
      auth: datas[0].reqs.auth,
      ledger: {
        name: "new name",
        right: "read",
        role: "member",
        default: true,
        ledgerId: createLedger.Ok().ledger.ledgerId,
        tenantId: datas[0].ress.tenants[0].tenantId,
      },
    });
    expect(rUpdate.isOk()).toBeTruthy();

    const listOwnersLedger = await fpApi.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: datas[0].reqs.auth,
    });
    const myOwnersLedger = listOwnersLedger.Ok().ledgers.filter((i) => i.ledgerId === createLedger.Ok().ledger.ledgerId);
    expect(myOwnersLedger.length).toEqual(1);
    expect(myOwnersLedger[0]).toEqual({
      createdAt: createLedger.Ok().ledger.createdAt,
      ledgerId: createLedger.Ok().ledger.ledgerId,
      maxShares: 5,
      name: "new name",
      ownerId: datas[0].ress.user.userId,
      users: [
        {
          createdAt: createLedger.Ok().ledger.users[0].createdAt,
          default: true,
          name: "new name",
          right: "read",
          role: "member",
          updatedAt: rUpdate.Ok().ledger.updatedAt,
          userId: datas[0].ress.user.userId,
        },
      ],
      tenantId: datas[0].ress.tenants[0].tenantId,
      updatedAt: rUpdate.Ok().ledger.updatedAt,
    });

    await fpApi.deleteLedger({
      type: "reqDeleteLedger",
      auth: datas[0].reqs.auth,
      ledger: {
        ledgerId: createLedger.Ok().ledger.ledgerId,
        tenantId: datas[0].ress.tenants[0].tenantId,
      },
    });

    const afterListOwnersLedger = await fpApi.listLedgersByUser({
      type: "reqListLedgersByUser",
      auth: datas[0].reqs.auth,
    });
    const myAfterDelete = afterListOwnersLedger.Ok().ledgers.filter((i) => i.ledgerId === createLedger.Ok().ledger.ledgerId);
    expect(myAfterDelete.length).toEqual(0);
  });

  it("getCertFromCsr should sign a valid CSR and return certificate", async () => {
    const auth: DashAuthType = datas[0].reqs.auth;

    // Generate CSR using DeviceIdKey.create() and DeviceIdCSR
    const deviceIdKey = await DeviceIdKey.create();
    const deviceIdCSR = new DeviceIdCSR(sthis, deviceIdKey);
    const subject: Subject = { commonName: "default-device" };
    const csrResult = await deviceIdCSR.createCSR(subject);

    expect(csrResult.isOk()).toBeTruthy();
    const csr = csrResult.Ok();

    const result = await fpApi.getCertFromCsr({
      type: "reqCertFromCsr",
      auth,
      csr,
    });

    expect(result.isOk()).toBeTruthy();
    expect(result.Ok().type).toEqual("resCertFromCsr");
    expect(result.Ok().certificate).toBeDefined();
    expect(typeof result.Ok().certificate).toBe("string");

    // Parse and verify the certificate JWT using jose
    const certificateJWT = result.Ok().certificate;
    const caPublicKey = await deviceCA.getCAKey();

    // Verify the certificate was signed by the CA
    const verified = await jwtVerify(certificateJWT, await caPublicKey.publicKey(), {
      typ: "CERT+JWT",
      algorithms: ["ES256"],
    });

    const claims = CertificatePayloadSchema.parse(verified.payload);
    expect(claims.certificate.issuer.commonName).toBe("Test Device CA");
  });

  describe("Cloud Token Tests", () => {
    const auth: DashAuthType = {
      token: `test-${sthis.nextId().str}`,
      type: "clerk",
    };
    let jwkPack: WithoutPromise<ReturnType<typeof jwkPackage>>;
    let ledger: ResCreateLedger;
    let tenant: UserTenant;
    let notMyLedger: ResCreateLedger;
    beforeAll(async () => {
      jwkPack = await jwkPackage();
      const rUser = await fpApi.ensureUser({
        type: "reqEnsureUser",
        auth,
      });
      tenant = rUser.Ok().tenants[0];
      ledger = (
        await fpApi.createLedger({
          type: "reqCreateLedger",
          auth,
          ledger: {
            tenantId: rUser.Ok().tenants[0].tenantId,
            name: `appid-test[${datas[0].ress.tenants[0].tenantId}]`,
          },
        })
      ).Ok();

      const notMyAuth: DashAuthType = {
        token: `test-${sthis.nextId().str}`,
        type: "clerk",
      };
      const rNotMyUser = await fpApi.ensureUser({
        type: "reqEnsureUser",
        auth: notMyAuth,
      });
      notMyLedger = (
        await fpApi.createLedger({
          type: "reqCreateLedger",
          auth: notMyAuth,
          ledger: {
            tenantId: rNotMyUser.Ok().tenants[0].tenantId,
            name: `notMyLedger[${tenant.tenantId}]`,
          },
        })
      ).Ok();
    });

    it("ensureCloudToken just appid", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const initial = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(initial.isOk()).toBeTruthy();
      const initToken = await jwtVerify(initial.Ok().cloudToken, jwkPack.pub);
      const reEnsure = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(reEnsure.isOk()).toBeTruthy();
      const reEnsureToken = await jwtVerify(reEnsure.Ok().cloudToken, jwkPack.pub);
      expect(reEnsureToken.payload).toEqual(initToken.payload);
    });

    it("ensureCloudToken appId but non accessable tenant", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const outerTenant = await fpApi.ensureCloudToken({
        type: "reqEnsureCloudToken",
        auth,
        appId,
        tenant: datas[0].ress.tenants[0].tenantId,
      });
      expect(outerTenant.isErr()).toBeTruthy();
    });

    it("ensureCloudToken appId but non accessable ledger", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const outerTenant = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
          ledger: notMyLedger.ledger.ledgerId,
        },
        jwkPack.opts,
      );
      expect(outerTenant.isErr()).toBeTruthy();
    });

    it("ensureCloudToken appId valid tenantId", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const validTenant = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
          tenant: ledger.ledger.tenantId,
        },
        jwkPack.opts,
      );
      expect(validTenant.isOk()).toBeTruthy();
      const token = await jwtVerify<FPCloudClaim>(validTenant.Ok().cloudToken, jwkPack.pub);
      expect(token.payload.selected.tenant).toBe(ledger.ledger.tenantId);
      expect(token.payload.selected.appId).toBe(appId);
      expect(token.payload.selected.ledger).not.toBe(ledger.ledger.ledgerId);
      expect(token.payload.selected.tenant).toBe(validTenant.Ok().tenant);
    });

    it("ensureCloudToken appId invalid tenantId", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const validTenant = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
          tenant: "invalid-tenant-id",
        },
        jwkPack.opts,
      );
      expect(validTenant.isErr()).toBeTruthy();
    });

    it("ensureCloudToken appId valid tenantId, ledgerId", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const validTenant = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
          ledger: ledger.ledger.ledgerId,
          tenant: ledger.ledger.tenantId,
        },
        jwkPack.opts,
      );
      expect(validTenant.isOk()).toBe(true);
      const token = await jwtVerify<FPCloudClaim>(validTenant.Ok().cloudToken, jwkPack.pub);
      expect(token.payload.selected.tenant).toBe(ledger.ledger.tenantId);
      expect(token.payload.selected.appId).toBe(appId);
      expect(token.payload.selected.ledger).toBe(ledger.ledger.ledgerId);
    });

    it("ensureCloudToken appId valid tenantId, invalid ledgerId", async () => {
      const id = sthis.nextId().str;
      const appId = `TEST_APP-${id}`;
      const validTenant = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
          tenant: tenant.tenantId,
          ledger: "invalid-ledger-id",
        },
        jwkPack.opts,
      );
      expect(validTenant.isErr()).toBeTruthy();
    });

    /**
     * Policy: Shared Ledger Access via Prefix Matching
     *
     * When a user is invited to a ledger and later calls ensureCloudToken with the same appId,
     * they should be granted access to the existing shared ledger rather than creating a new one.
     *
     * The ledger name format is: `{appId}-{ownerUserId}`
     * When an invited user calls ensureCloudToken with appId, the system should:
     * 1. First check for an exact appId binding (existing behavior)
     * 2. If not found, check if user has access to any ledger whose name starts with appId (prefix match)
     * 3. Only create a new ledger if no matching ledger is found
     *
     * This enables collaborative apps where multiple users share the same database:
     * - User A creates app with appId "vf-my-app-install1-todos"
     * - System creates ledger "vf-my-app-install1-todos-{userA_id}"
     * - User A invites User B to the ledger
     * - User B visits app with same appId → gets access to User A's ledger (not a new one)
     */
    it("ensureCloudToken grants invited user access to shared ledger via prefix match", async () => {
      const userA = datas[7];
      const userB = datas[8];
      const id = sthis.nextId().str;
      const appId = `SHARED_LEDGER_TEST-${id}`;

      // User A creates a ledger via ensureCloudToken
      // This creates a ledger named "{appId}-{userA_id}" and binds it to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();
      const userALedgerId = userAToken.Ok().ledger;

      // User A invites User B to the ledger (not just the tenant)
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            existingUserId: userB.ress.user.userId,
          },
          invitedParams: {
            ledger: {
              id: userALedgerId,
              role: "member",
              right: "write",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();

      // User B redeems the invite (adds them to LedgerUsers)
      const redeem = await fpApi.redeemInvite({
        type: "reqRedeemInvite",
        auth: userB.reqs.auth,
      });
      expect(redeem.isOk()).toBeTruthy();

      // User B calls ensureCloudToken with the same appId
      // Without prefix matching, this would create a NEW ledger "{appId}-{userB_id}"
      // With prefix matching, User B should get access to User A's existing ledger
      const userBToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userB.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userBToken.isOk()).toBeTruthy();

      // Critical assertion: User B should get the SAME ledger as User A
      expect(userBToken.Ok().ledger).toBe(userALedgerId);

      // Verify they're using the same tenant too
      expect(userBToken.Ok().tenant).toBe(userAToken.Ok().tenant);
    });

    it("ensureCloudToken auto-redeems pending invite for ledger access", async () => {
      // User A (datas[5]) creates a ledger and binds it to an appId
      const userA = datas[5];
      const userB = datas[6];
      const id = sthis.nextId().str;
      const appId = `INVITE_TEST_APP-${id}`;

      // User A creates a ledger via ensureCloudToken (creates binding)
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();

      // User A invites User B to that ledger
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            existingUserId: userB.ress.user.userId,
          },
          invitedParams: {
            ledger: {
              id: userAToken.Ok().ledger,
              role: "member",
              right: "read",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();
      expect(invite.Ok().invite.status).toBe("pending");

      // User B calls ensureCloudToken with the same appId (before explicitly redeeming)
      // This should auto-redeem the invite and grant access
      const userBToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userB.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userBToken.isOk()).toBeTruthy();
      expect(userBToken.Ok().ledger).toBe(userAToken.Ok().ledger);
      expect(userBToken.Ok().tenant).toBe(userAToken.Ok().tenant);
    });

    it("ensureCloudToken rejects uninvited user trying to access existing ledger (strict policy)", async () => {
      // User A creates a ledger via ensureCloudToken
      const userA = datas[3];
      const userC = datas[4]; // User C has NOT been invited
      const id = sthis.nextId().str;
      const appId = `STRICT_POLICY_TEST-${id}`;

      // User A creates a ledger bound to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();

      // User C tries to access the same appId WITHOUT being invited
      // Under strict policy, this should fail
      const userCToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userC.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );

      // User C should be rejected - they're not in LedgerUsers for this ledger
      expect(userCToken.isErr()).toBeTruthy();
      expect(userCToken.Err().message).toContain("not authorized");
    });

    it("ensureCloudToken allows invited user after redemption", async () => {
      // Same as above but User D IS invited
      const userA = datas[3];
      const userD = datas[9];
      const id = sthis.nextId().str;
      const appId = `INVITED_ACCESS_TEST-${id}`;

      // User A creates a ledger bound to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();
      const ledgerId = userAToken.Ok().ledger;

      // User A invites User D to the ledger
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            existingUserId: userD.ress.user.userId,
          },
          invitedParams: {
            ledger: {
              id: ledgerId,
              role: "member",
              right: "write",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();

      // User D redeems the invite
      const redeem = await fpApi.redeemInvite({
        type: "reqRedeemInvite",
        auth: userD.reqs.auth,
      });
      expect(redeem.isOk()).toBeTruthy();

      // Now User D should be able to access the ledger
      const userDToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userD.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );

      expect(userDToken.isOk()).toBeTruthy();
      expect(userDToken.Ok().ledger).toBe(ledgerId);
    });

    it("ensureCloudToken auto-redeems invite without explicit redeemInvite call", async () => {
      // This tests that ensureCloudToken itself will redeem pending invites
      // Before the fix, this would fail because the user wasn't in LedgerUsers
      const userA = datas[2];
      const userE = datas[1]; // User E will be invited but NOT explicitly call redeemInvite
      const id = sthis.nextId().str;
      const appId = `AUTO_REDEEM_TEST-${id}`;

      // User A creates a ledger bound to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();
      const ledgerId = userAToken.Ok().ledger;

      // User A invites User E to the ledger
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            existingUserId: userE.ress.user.userId,
          },
          invitedParams: {
            ledger: {
              id: ledgerId,
              role: "member",
              right: "write",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();

      // User E does NOT explicitly call redeemInvite
      // Instead, they directly call ensureCloudToken
      // This should auto-redeem the invite and grant access
      const userEToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userE.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );

      // Before the fix, this would fail with "user not authorized for ledger"
      // After the fix, ensureCloudToken calls ensureUser which calls redeemInvite
      expect(userEToken.isOk()).toBeTruthy();
      expect(userEToken.Ok().ledger).toBe(ledgerId);
    });

    it("ensureCloudToken auto-redeems invite by email (real UI flow)", async () => {
      // This tests the actual flow: invite by email, user visits with matching email
      const userA = datas[5];
      const userF = datas[6]; // User F will be invited BY EMAIL
      const id = sthis.nextId().str;
      const appId = `EMAIL_INVITE_TEST-${id}`;

      // User A creates a ledger bound to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();
      const ledgerId = userAToken.Ok().ledger;

      // Get User F's email from their auth params (simulating what invite UI does)
      // The TestApiToken generates email as `test${userId}@test.de`
      const userFEmail = `testuserId-${userF.reqs.auth.token}@test.de`;

      // User A invites User F BY EMAIL (like the real UI does)
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            byEmail: userFEmail,
          },
          invitedParams: {
            ledger: {
              id: ledgerId,
              role: "member",
              right: "write",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();

      // User F does NOT explicitly call redeemInvite
      // They just visit the vibe URL which calls ensureCloudToken
      const userFToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userF.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );

      // This should auto-redeem because ensureUser->redeemInvite finds by email
      expect(userFToken.isOk()).toBeTruthy();
      expect(userFToken.Ok().ledger).toBe(ledgerId);
    });

    it("ensureCloudToken auto-redeems for brand new user invited by email", async () => {
      // This tests the exact production scenario:
      // - User A creates a vibe and invites by email
      // - User B has NEVER visited before (no user record exists)
      // - User B clicks link, logs in, and ensureCloudToken is called
      const userA = datas[7];
      const id = sthis.nextId().str;
      const appId = `NEW_USER_EMAIL_INVITE-${id}`;

      // User A creates a ledger bound to appId
      const userAToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: userA.reqs.auth,
          appId,
        },
        jwkPack.opts,
      );
      expect(userAToken.isOk()).toBeTruthy();
      const ledgerId = userAToken.Ok().ledger;

      // Create a completely new user token that has NEVER been used
      // This simulates a user who has never visited the system
      const newUserToken = `brand-new-user-${id}`;
      const newUserEmail = `testuserId-${newUserToken}@test.de`;

      // User A invites the NEW user BY EMAIL
      const invite = await fpApi.inviteUser({
        type: "reqInviteUser",
        auth: userA.reqs.auth,
        ticket: {
          query: {
            byEmail: newUserEmail,
          },
          invitedParams: {
            ledger: {
              id: ledgerId,
              role: "member",
              right: "write",
            },
          },
        },
      });
      expect(invite.isOk()).toBeTruthy();

      // NEW user visits for the first time - they have no user record yet
      // ensureCloudToken should:
      // 1. Find existing binding for appId
      // 2. Call ensureUser (which creates user + redeems invite)
      // 3. Grant access to the ledger
      const newUserAuth: DashAuthType = {
        type: "clerk",
        token: newUserToken,
      };

      const newUserCloudToken = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth: newUserAuth,
          appId,
        },
        jwkPack.opts,
      );

      // Should succeed because ensureUser->redeemInvite finds invite by email
      expect(newUserCloudToken.isOk()).toBeTruthy();
      expect(newUserCloudToken.Ok().ledger).toBe(ledgerId);
    });
  });

  it("create session with claim", async () => {
    const auth: DashAuthType = datas[0].reqs.auth;
    // fpApi.sthis.env.set("CLOUD_SESSION_TOKEN_SECRET", "

    const resultId = sthis.nextId(12).str;
    const rledger = await fpApi.createLedger({
      type: "reqCreateLedger",
      auth: datas[0].reqs.auth,
      ledger: {
        tenantId: datas[0].ress.tenants[0].tenantId,
        name: `Session Ledger`,
      },
    });
    await fpApi.updateLedger({
      type: "reqUpdateLedger",
      auth: datas[0].reqs.auth,
      ledger: {
        ledgerId: rledger.Ok().ledger.ledgerId,
        tenantId: datas[0].ress.tenants[0].tenantId,
        name: `Session X-Ledger`,
        right: "read",
        role: "member",
      },
    });

    const res1 = await fpApi.getTokenByResultId({
      type: "reqTokenByResultId",
      resultId,
    });
    expect(res1.Ok()).toEqual({
      type: "resTokenByResultId",
      resultId,
      status: "not-found",
    });

    const jwkPack = await jwkPackage();
    const resSt = await fpApi.getCloudSessionToken(
      {
        type: "reqCloudSessionToken",
        auth,
        resultId,
        selected: {
          ledger: rledger.Ok().ledger.ledgerId,
          tenant: datas[0].ress.tenants[0].tenantId,
        },
      },
      jwkPack.opts,
    );
    expect(resSt.isOk()).toBeTruthy();
    const v = await jwtVerify(resSt.Ok().token, jwkPack.pub);
    expect(v.payload.exp).toBeLessThanOrEqual(new Date().getTime() + 3700000);

    const res2 = await fpApi.getTokenByResultId({
      type: "reqTokenByResultId",
      resultId,
    });
    expect(res2.Ok()).toEqual({
      type: "resTokenByResultId",
      resultId,
      status: "found",
      token: resSt.Ok().token,
    });

    const res3 = await fpApi.getTokenByResultId({
      type: "reqTokenByResultId",
      resultId,
    });
    expect(res3.Ok()).toEqual({
      type: "resTokenByResultId",
      resultId,
      status: "not-found",
    });

    expect(v.payload).toEqual({
      aud: "TEST_A",
      created: v.payload.created,
      email: v.payload.email,
      nickname: v.payload.nickname,
      provider: "github",
      selected: v.payload.selected,
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
          id: datas[0].ress.tenants[0].tenantId,
          role: "admin",
        },
      ],
      userId: datas[0].ress.user.userId,
    });

    await fpApi.deleteLedger({
      type: "reqDeleteLedger",
      auth: datas[0].reqs.auth,
      ledger: {
        ledgerId: rledger.Ok().ledger.ledgerId,
        tenantId: datas[0].ress.tenants[0].tenantId,
      },
    });
  });

  it("check The implicit update of limits", async () => {
    const reqEnsureUser: ReqEnsureUser = {
      type: "reqEnsureUser",
      auth: {
        token: `test-${sthis.nextId().str}`,
        type: "clerk",
      },
    };
    const fpApi = new FPApiSQL(
      sthis,
      db,
      { clerk: new TestApiToken(sthis) },
      {
        cloudPublicKeys: [],
        clerkPublishableKey: "test-clerk-publishable-key",
        maxTenants: 5,
        maxAdminUsers: 5,
        maxMemberUsers: 5,
        maxInvites: 10,
        maxLedgers: 5,
        maxAppIdBindings: 5,
        deviceCA,
      },
    );
    await fpApi.ensureUser(reqEnsureUser);
    await fpApi.createTenant({
      type: "reqCreateTenant",
      auth: reqEnsureUser.auth,
      tenant: {
        // ownerUserId: data[0].ress.user.userId,
      },
    });
    const user = await fpApi.ensureUser(reqEnsureUser);
    expect(user.Ok().user.maxTenants).toEqual(5);
    expect(user.Ok().tenants[0].tenant.limits).toEqual({
      maxAdminUsers: 5,
      maxMemberUsers: 5,
      maxInvites: 10,
      maxLedgers: 5,
    });

    const fpApi2 = new FPApiSQL(
      sthis,
      db,
      { clerk: new TestApiToken(sthis) },
      {
        cloudPublicKeys: [],
        clerkPublishableKey: "test-clerk-publishable-key",
        maxTenants: 50,
        maxAdminUsers: 50,
        maxMemberUsers: 50,
        maxInvites: 100,
        maxLedgers: 50,
        maxAppIdBindings: 50,
        deviceCA: deviceCA,
      },
    );
    const res = await fpApi2.ensureUser(reqEnsureUser);
    expect(res.Ok().user.maxTenants).toBe(50);
    expect(res.Ok().tenants[0].tenant.limits).toEqual({
      maxAdminUsers: 50,
      maxMemberUsers: 50,
      maxInvites: 100,
      maxLedgers: 50,
    });

    const fpApi3 = new FPApiSQL(
      sthis,
      db,
      { clerk: new TestApiToken(sthis) },
      {
        cloudPublicKeys: [],
        clerkPublishableKey: "test-clerk-publishable-key",
        maxTenants: 17,
        maxAdminUsers: 17,
        maxMemberUsers: 17,
        maxInvites: 17,
        maxLedgers: 17,
        maxAppIdBindings: 17,
        deviceCA,
      },
    );
    const dLimits = await fpApi3.ensureUser(reqEnsureUser);
    expect(dLimits.Ok().user.maxTenants).toBe(50);
    expect(dLimits.Ok().tenants[0].tenant.limits).toEqual({
      maxAdminUsers: 50,
      maxMemberUsers: 50,
      maxInvites: 100,
      maxLedgers: 50,
    });
  });

  // it("extend token with 6 hours expiry", async () => {
  //   const auth: AuthType = data[0].reqs.auth;

  //   // Create a session token first
  //   const resSt = await fpApi.getCloudSessionToken(
  //     {
  //       type: "reqCloudSessionToken",
  //       auth,
  //       selected: {
  //         tenant: data[0].ress.tenants[0].tenantId,
  //       },
  //     },
  //     {
  //       secretToken:
  //         "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",
  //       publicToken:
  //         "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
  //       issuer: "TEST_I",
  //       audience: "TEST_A",
  //       validFor: 3600000, // 1 hour
  //     },
  //   );
  //   expect(resSt.isOk()).toBeTruthy();

  //   const validFor = 40000; // 40000 seconds
  //   // Extend the token
  //   const extendResult = await fpApi.extendToken(
  //     {
  //       type: "reqExtendToken",
  //       token: resSt.Ok().token,
  //     },
  //     {
  //       secretToken:
  //         "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",
  //       publicToken:
  //         "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
  //       issuer: "TEST_I",
  //       audience: "TEST_A",
  //       validFor: 60 * 60, // 1 hour
  //       extendValidFor: validFor, // 40000 seconds (approximately 6 hours)
  //     },
  //   );

  //   if (extendResult.isErr()) {
  //     console.log("extendToken error:", extendResult.Err());
  //   }
  //   expect(extendResult.isOk()).toBeTruthy();
  //   const extendedResponse = extendResult.Ok();

  //   // Verify the response structure
  //   expect(extendedResponse.type).toBe("resExtendToken");
  //   expect(typeof extendedResponse.token).toBe("string");

  //   // Verify the new token is valid and has extended expiry
  //   const pub = await sts.env2jwk(
  //     "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
  //     "ES256",
  //   );
  //   const verifyExtended = await jwtVerify(extendedResponse.token, pub);

  //   // Check that the new expiry is approximately 6 hours from now
  //   const tokenExpiry = verifyExtended.payload.exp ?? 0;

  //   // Allow for some variance (within 1 minute)
  //   expect(Math.abs(tokenExpiry - Date.now() / 1000) - validFor).toBeLessThanOrEqual(60);

  //   // Verify the payload content is preserved
  //   expect(verifyExtended.payload.userId).toBe(data[0].ress.user.userId);
  //   expect(verifyExtended.payload.iss).toBe("TEST_I");
  //   expect(verifyExtended.payload.aud).toBe("TEST_A");
  // });

  // // describe("getCloudDbToken", () => {
  // const ctx = {
  //   secretToken:
  //     "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",
  //   publicToken:
  //     "zeWndr5LEoaySgKSo2aZniYqcrEJBPswFRe3bwyxY7Nmr3bznXkHhFm77VxHprvCskpKVHEwVzgQpM6SAYkUZpZcEdEunwKmLUYd1yJ4SSteExyZw4GC1SvJPLDpGxKBKb6jkkCsaQ3MJ5YFMKuGUkqpKH31Dw7cFfjdQr5XUiXue",
  //   issuer: "TEST_I",
  //   audience: "TEST_A",
  //   validFor: 3600000, // 1 hour
  // };
  // // eslint-disable-next-line no-restricted-globals
  // const publicKey = JSON.parse(new TextDecoder().decode(base58btc.decode(ctx.publicToken))) as JWKPublic;

  // it("with ledger and tenant ", async () => {
  //   const tenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {
  //       // ownerUserId: data[0].ress.user.userId,
  //     },
  //   });
  //   const ledger = await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       name: `DB Token Ledger`,
  //     },
  //   });
  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       ledgerId: ledger.Ok().ledger.ledgerId,
  //       localDbName: "not-existing-db",
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Ok();
  //   if (!isResCloudDbTokenBound(res)) {
  //     assert.fail("Expected not bound response");
  //     return;
  //   }
  //   const rTandC = await convertToTokenAndClaims(
  //     {
  //       getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //         return Promise.resolve({
  //           type: "resClerkPublishableKey",
  //           publishableKey: "undefined",
  //           cloudPublicKeys: [publicKey],
  //         });
  //       },
  //     },
  //     logger,
  //     res.token,
  //   );
  //   // console.log(rTandC);
  //   expect(rTandC.isOk()).toBeTruthy();
  //   const tandC = rTandC.Ok();
  //   expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //   expect(tandC.claims.selected.ledger).toBe(ledger.Ok().ledger.ledgerId);
  //   // expect(tandC.claims.ledgers).toEqual([
  //   //   {
  //   //     id: ledger.Ok().ledger.ledgerId,
  //   //     right: "write",
  //   //     role: "admin",
  //   //   },
  //   // ]);
  // });
  // it("with non existing ledger and tenant", async () => {
  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       ledgerId: "non-existing-ledger",
  //       tenantId: "non-existing-tenant",
  //       localDbName: `no-existing-local-db-${sthis.nextId(6).str}`,
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Err();
  //   expect(JSON.parse(res.message).msg).toEqual("User has no access to tenant or ledger");
  // });
  // it("without ledger and tenant but appId and localDbName not existing no ambiguity", async () => {
  //   const tenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {
  //       defaultTenant: true,
  //       // ownerUserId: data[0].ress.user.userId,
  //     },
  //   });
  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       localDbName: `no-existing-local-db-${sthis.nextId(6).str}`,
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Ok();
  //   if (!isResCloudDbTokenBound(res)) {
  //     assert.fail("Expected not bound response");
  //     return;
  //   }
  //   const rTandC = await convertToTokenAndClaims(
  //     {
  //       getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //         return Promise.resolve({
  //           type: "resClerkPublishableKey",
  //           publishableKey: "undefined",
  //           cloudPublicKeys: [publicKey],
  //         });
  //       },
  //     },
  //     logger,
  //     res.token,
  //   );
  //   const tandC = rTandC.Ok();
  //   // console.log(data.map((i) => i.ress.tenants).map((j) => j.map((k) => k.tenantId)));
  //   expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //   expect(tandC.claims.selected.ledger).toBeDefined();
  // });
  // it("without ledger and tenant but appId and localDbName existing", async () => {
  //   const tenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {
  //       defaultTenant: true,
  //       // ownerUserId: data[0].ress.user.userId,
  //     },
  //   });
  //   const ledger = await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       name: `DB Token Ledger-${sthis.nextId(6).str}`,
  //     },
  //   });
  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       localDbName: ledger.Ok().ledger.name,
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Ok();
  //   if (!isResCloudDbTokenBound(res)) {
  //     assert.fail("Expected not bound response");
  //     return;
  //   }
  //   const rTandC = await convertToTokenAndClaims(
  //     {
  //       getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //         return Promise.resolve({
  //           type: "resClerkPublishableKey",
  //           publishableKey: "undefined",
  //           cloudPublicKeys: [publicKey],
  //         });
  //       },
  //     },
  //     logger,
  //     res.token,
  //   );
  //   const tandC = rTandC.Ok();
  //   // console.log(data.map((i) => i.ress.tenants).map((j) => j.map((k) => k.tenantId)));
  //   expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //   expect(tandC.claims.selected.ledger).toBe(ledger.Ok().ledger.ledgerId);
  // });
  // it("without ledger and tenant but appId and localDbName and ambiguity", async () => {
  //   const tenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {
  //       defaultTenant: true,
  //       // ownerUserId: data[0].ress.user.userId,
  //     },
  //   });
  //   const name = `DB Token Ledger-${sthis.nextId(6).str}`;
  //   await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       name,
  //     },
  //   });
  //   await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       name,
  //     },
  //   });

  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       localDbName: name,
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Ok();
  //   if (!isResCloudDbTokenBound(res)) {
  //     assert.fail("Expected not bound response");
  //     return;
  //   }
  //   const rTandC = await convertToTokenAndClaims(
  //     {
  //       getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //         return Promise.resolve({
  //           type: "resClerkPublishableKey",
  //           publishableKey: "undefined",
  //           cloudPublicKeys: [publicKey],
  //         });
  //       },
  //     },
  //     logger,
  //     res.token,
  //   );
  //   const tandC = rTandC.Ok();
  //   // console.log(data.map((i) => i.ress.tenants).map((j) => j.map((k) => k.tenantId)));
  //   expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //   expect(tandC.claims.selected.ledger).toBe("xxx"); //ledger.Ok().ledger.ledgerId);
  // });
  // it("without ledger but tenant appId and localDbName and no ambiguity", async () => {
  //   const ledgerName = `DB Token Ledger-${sthis.nextId(6).str}`;

  //   const otherTenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {},
  //   });
  //   await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: otherTenant.Ok().tenant.tenantId,
  //       name: ledgerName,
  //     },
  //   });
  //   const tenant = await fpApi.createTenant({
  //     type: "reqCreateTenant",
  //     auth: data[0].reqs.auth,
  //     tenant: {
  //       defaultTenant: true,
  //       // ownerUserId: data[0].ress.user.userId,
  //     },
  //   });
  //   const ledger = await fpApi.createLedger({
  //     type: "reqCreateLedger",
  //     auth: data[0].reqs.auth,
  //     ledger: {
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       name: ledgerName,
  //     },
  //   });
  //   const rRes = await fpApi.getCloudDbToken(
  //     {
  //       type: "reqCloudDbToken",
  //       auth: data[0].reqs.auth,
  //       tenantId: tenant.Ok().tenant.tenantId,
  //       localDbName: ledgerName,
  //       appId: "not-existing-app",
  //       deviceId: "not-existing-device",
  //     },
  //     ctx,
  //   );
  //   const res = rRes.Ok();
  //   if (!isResCloudDbTokenBound(res)) {
  //     assert.fail("Expected not bound response");
  //     return;
  //   }
  //   const rTandC = await convertToTokenAndClaims(
  //     {
  //       getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //         return Promise.resolve({
  //           type: "resClerkPublishableKey",
  //           publishableKey: "undefined",
  //           cloudPublicKeys: [publicKey],
  //         });
  //       },
  //     },
  //     logger,
  //     res.token,
  //   );
  //   const tandC = rTandC.Ok();
  //   // console.log(data.map((i) => i.ress.tenants).map((j) => j.map((k) => k.tenantId)));
  //   expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //   expect(tandC.claims.selected.ledger).toBe(ledger.Ok().ledger.ledgerId); //ledger.Ok().ledger.ledgerId);
  // });

  //   it("without ledger but tenant appId and localDbName implicit create", async () => {
  //     const ledgerName = `DB Token Ledger-${sthis.nextId(6).str}`;
  //     const tenant = await fpApi.createTenant({
  //       type: "reqCreateTenant",
  //       auth: data[0].reqs.auth,
  //       tenant: {
  //         defaultTenant: true,
  //         // ownerUserId: data[0].ress.user.userId,
  //       },
  //     });
  //     const rRes = await fpApi.getCloudDbToken(
  //       {
  //         type: "reqCloudDbToken",
  //         auth: data[0].reqs.auth,
  //         tenantId: tenant.Ok().tenant.tenantId,
  //         localDbName: ledgerName,
  //         appId: "not-existing-app",
  //         deviceId: "not-existing-device",
  //       },
  //       ctx,
  //     );
  //     const res = rRes.Ok();
  //     if (!isResCloudDbTokenBound(res)) {
  //       assert.fail("Expected not bound response");
  //       return;
  //     }
  //     const rTandC = await convertToTokenAndClaims(
  //       {
  //         getClerkPublishableKey(): Promise<ResClerkPublishableKey> {
  //           return Promise.resolve({
  //             type: "resClerkPublishableKey",
  //             publishableKey: "undefined",
  //             cloudPublicKeys: [publicKey],
  //           });
  //         },
  //       },
  //       logger,
  //       res.token,
  //     );
  //     const tandC = rTandC.Ok();
  //     // console.log(data.map((i) => i.ress.tenants).map((j) => j.map((k) => k.tenantId)));
  //     expect(tandC.claims.selected.tenant).toBe(tenant.Ok().tenant.tenantId);
  //     expect(tandC.claims.selected.ledger).toBeDefined();
  //   });
});

it("queryEmail strips +....@", async () => {
  expect(queryEmail("a.C@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+bla@b.de")).toBe("ac@b.de");
  expect(queryEmail("a.C+huhu+@b.de")).toBe("achuhu@b.de");
  expect(queryEmail("a.C+huhu+bla@b.de")).toBe("achuhu@b.de");
});

it("resWellKnownJwks", async () => {
  const r = await resWellKnownJwks(new Request("https://example.com/.well-known/jwks.json"), {
    CLOUD_SESSION_TOKEN_PUBLIC:
      "zeWndr5LEoaySgKSo2aZniYqXf5WxWq3WDGYvT4K4ggqX2wWPXAc4TXhRFrQAGUgCwkAYHCTZNn8Yqz62DzFzssSEEfMjmh5yP26YY5LBLUo14GdRKyD19zRV4jsic53jxEy3NdBs2i4rwAfyYQoPGzUUhnBxTXvqB2RYoShcs2zp",
  });
  expect(JSON.parse(await r.text())).toEqual({
    keys: [
      {
        kty: "EC",
        use: "sig",
        crv: "P-256",
        // kid: expect.any(String),
        x: expect.any(String),
        y: expect.any(String),
        alg: "ES256",
      },
    ],
  });
});
