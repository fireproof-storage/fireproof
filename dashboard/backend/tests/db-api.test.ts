import { Result, WithoutPromise } from "@adviser/cement";
import { Subject, CertificatePayloadSchema, FPDeviceIDSession } from "@fireproof/core-types-base";
import { createClient } from "@libsql/client/node";
import { type LibSQLDatabase, drizzle } from "drizzle-orm/libsql";
import { jwtVerify } from "jose/jwt/verify";
import {
  FPApiInterface,
  ResCreateLedger,
  UserTenant,
  type AdminTenant,
  type DashAuthType,
  type QueryUser,
  type ReqEnsureUser,
  type ResEnsureUser,
} from "@fireproof/core-types-protocols-dashboard";
import { queryEmail, queryNick } from "../sql/sql-helper.js";
import { ensureSuperThis, sts } from "@fireproof/core-runtime";
import { describe, beforeAll, expect, it, inject } from "vitest";
import { resWellKnownJwks } from "../well-known-jwks.js";
import { DeviceIdCA, DeviceIdKey, DeviceIdCSR, DeviceIdSignMsg } from "@fireproof/core-device-id";
import { FPCloudClaim } from "@fireproof/core-types-protocols-cloud";
import { createHandler } from "../create-handler.js";
import { DashboardApiImpl } from "@fireproof/core-protocols-dashboard";
import { createTestDeviceCA } from "./helper.create-device-id-ca.js";

describe("db-api", () => {
  // let db: BetterSQLite3Database
  let db: LibSQLDatabase;
  const sthis = ensureSuperThis();
  let fpApi: FPApiInterface;
  const datas = [] as {
    reqs: ReqEnsureUser & { user: Awaited<ReturnType<typeof createUser>> };
    ress: ResEnsureUser;
  }[];
  // const logger = ensureLogger(sthis, "dashboard-backend-db-api-test");
  let deviceCA: DeviceIdCA;

  const session = sthis.nextId().str;
  async function createUser(seqUserId: number) {
    // console.log("Creating test user", session, seqUserId);
    const devid = await DeviceIdKey.create();
    const devkey = (await DeviceIdKey.createFromJWK(await devid.exportPrivateJWK())).Ok();
    const deviceIdCSR = new DeviceIdCSR(sthis, devkey);
    const rCsrResult = await deviceIdCSR.createCSR({ commonName: "test-device-id" });
    const userId = `${session}-${seqUserId}`;
    const rProcessResult = await deviceCA.processCSR(rCsrResult.Ok(), {
      azp: `test-app-${userId}-${sthis.nextId().str}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: "test-issuer",
      jti: sthis.nextId().str,
      nbf: Math.floor(Date.now() / 1000),
      params: {
        nick: `nick-${userId}`,
        email: `email-${userId}@example.com`,
        email_verified: true,
        first: `first-${userId}`,
        image_url: `http://example.com/image-${userId}.png`,
        last: `last-${userId}`,
        name: `name-${userId}`,
        public_meta: `{ "role": "tester-${userId}" }`,
      },

      role: "devide-id",
      sub: `device-id-subject-${sthis.nextId().str}`,
      userId: `user-id-${userId}`,

      aud: ["http://test-audience.localhost/"],
    });
    // console.log("DeviceIdCA-processCSR", rProcessResult.Ok().certificatePayload);
    const deviceIdSigner = new DeviceIdSignMsg(sthis.txt.base64, devkey, rProcessResult.Ok().certificatePayload);

    let seq = 0;
    const getDashBoardToken = async (): Promise<DashAuthType> => {
      const now = Math.floor(Date.now() / 1000);
      const token = await deviceIdSigner.sign(
        {
          iss: "app-id",
          sub: "device-id",
          deviceId: await devkey.fingerPrint(),
          seq: ++seq,
          exp: now + 120,
          nbf: now - 2,
          iat: now,
          jti: sthis.nextId().str,
        } satisfies FPDeviceIDSession,
        "ES256",
      );
      return {
        type: "device-id",
        token,
      };
    };
    return { devkey, deviceIdSigner, getDashBoardToken };
  }

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

    const env = {
      CLOUD_SESSION_TOKEN_PUBLIC:
        "zeWndr5LEoaySgKSo2aZniYqZ3z6Ecx3Z6qFThtXC8aMEAx6oDFMKgm3SptRgHhN4UxFSvTnmU5HXNrF6cZ4dBz6Ddphq8hsxzUKbryaBu5AFnbNyHrZEod2uw2q2UnPgeEdTDszU1AzSn7iiEfSv4NZ17ENVx7WfRAY8J8F1aog8",
      CLERK_PUBLISHABLE_KEY: "pk_test_cHJlY2lzZS1jb2x0LTQ5LmNsZXJrLmFjY291bnRzLmRldiQ",
      DEVICE_ID_CA_PRIV_KEY: await sts.jwk2env(await deviceCA.getCAKey().exportPrivateJWK()),
      DEVICE_ID_CA_CERT: await deviceCA.caCertificate().then((r) => r.Ok().jwtStr),

      CLOUD_SESSION_TOKEN_SECRET:
        "z33KxHvFS3jLz72v9DeyGBqo7H34SCC1RA5LvQFCyDiU4r4YBR4jEZxZwA9TqBgm6VB5QzwjrZJoVYkpmHgH7kKJ6Sasat3jTDaBCkqWWfJAVrBL7XapUstnKW3AEaJJKvAYWrKYF9JGqrHNU8WVjsj3MZNyqqk8iAtTPPoKtPTLo2c657daVMkxibmvtz2egnK5wPeYEUtkbydrtBzteN25U7zmGqhS4BUzLjDiYKMLP8Tayi",

      MAX_ADMIN_USERS: "5",
      MAX_MEMBER_USERS: "5",
      MAX_TENANTS: "10",
    };
    const svc = await createHandler(db, env);

    const unknownDevId = await createUser(999);

    fpApi = new DashboardApiImpl({
      apiUrl: "http://test-dashboard-api.localhost/FPApi",
      fetch: (url: string, init?: RequestInit) => {
        return svc(new Request(url, init));
      },
      getToken: async () => {
        return Result.Ok(await unknownDevId.getDashBoardToken());
      },
    });

    for (const userToCreate of Array(10)
      .fill(0)
      .map(async (_, i) => {
        const user = await createUser(i);
        return {
          ress: {} as ResEnsureUser,
          reqs: {
            type: "reqEnsureUser",
            auth: await user.getDashBoardToken(),
            user,
          } satisfies ReqEnsureUser & { user: Awaited<ReturnType<typeof createUser>> },
        };
      })) {
      datas.push(await userToCreate);
    }

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
              queryEmail: queryEmail(res.user.byProviders[0].cleanEmail),
              queryNick: queryNick(res.user.byProviders[0].cleanNick),

              createdAt: res.user.byProviders[0].createdAt,
              params: res.user.byProviders[0].params,
              providerUserId: res.user.byProviders[0].providerUserId,
              queryProvider: "device-id",
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
              maxAdminUsers: expect.any(Number),
              maxInvites: expect.any(Number),
              maxLedgers: expect.any(Number),
              maxMemberUsers: expect.any(Number),
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
              queryEmail: queryEmail(data.ress.user.byProviders[0].cleanEmail),
              queryNick: queryNick(data.ress.user.byProviders[0].cleanNick),

              providerUserId: data.ress.user.byProviders[0].providerUserId,
              queryProvider: "device-id",
              createdAt: data.ress.user.byProviders[0].createdAt,

              params: data.ress.user.byProviders[0].params,
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
    expect(resinsert.Err().message).toContain("cannot invite self");
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
    expect(resinsert.Err().message).toContain("existingUserId not found");
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
    expect(new Date(resinsert.Ok().invite.createdAt).getTime()).toBeLessThan(
      new Date(resupdate.Ok().invite.expiresAfter).getTime(),
    );
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
      auth: await datas[0].reqs.user.getDashBoardToken(),
      tenant: {
        // ownerUserId: data[0].ress.user.userId,
      },
    });
    expect(tenant.Ok()).toEqual({
      tenant: {
        createdAt: tenant.Ok().tenant.createdAt,
        maxAdminUsers: tenant.Ok().tenant.maxAdminUsers,
        maxInvites: 10,
        maxLedgers: 5,
        maxMemberUsers: tenant.Ok().tenant.maxMemberUsers,
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
    const auth: DashAuthType = undefined as unknown as DashAuthType;
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

      const otherUser = await createUser(11111);
      const notMyAuth = await otherUser.getDashBoardToken();
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
        // jwkPack.opts,
      );
      expect(initial.isOk()).toBeTruthy();
      const initToken = await jwtVerify(initial.Ok().cloudToken, jwkPack.pub);
      const reEnsure = await fpApi.ensureCloudToken(
        {
          type: "reqEnsureCloudToken",
          auth,
          appId,
        },
        // jwkPack.opts,
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
        // jwkPack.opts,
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
        // jwkPack.opts,
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
        // jwkPack.opts,
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
        // jwkPack.opts,
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
        // jwkPack.opts,
      );
      expect(validTenant.isErr()).toBeTruthy();
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
        // jwkPack.opts,
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
        // jwkPack.opts,
      );
      expect(userBToken.isOk()).toBeTruthy();
      expect(userBToken.Ok().ledger).toBe(userAToken.Ok().ledger);
      expect(userBToken.Ok().tenant).toBe(userAToken.Ok().tenant);
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
      // jwkPack.opts,
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
      aud: "PUBLIC",
      created: v.payload.created,
      email: v.payload.email,
      nickname: v.payload.nickname,
      provider: "github",
      selected: v.payload.selected,
      exp: v.payload.exp,
      iat: v.payload.iat,
      iss: "FP_CLOUD",
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
    const reqEnsureUser: ReqEnsureUser = { type: "reqEnsureUser", auth: undefined as unknown as DashAuthType };
    // const fpApi = new FPApiSQL(
    //   sthis,
    //   db,
    //   { clerk: new TestApiToken(sthis) },
    //   {
    //     cloudPublicKeys: [],
    //     clerkPublishableKey: "test-clerk-publishable-key",
    //     maxTenants: 5,
    //     maxAdminUsers: 5,
    //     maxMemberUsers: 5,
    //     maxInvites: 10,
    //     maxLedgers: 5,
    //     maxAppIdBindings: 5,
    //     deviceCA,
    //   },
    // );
    await fpApi.ensureUser(reqEnsureUser);
    await fpApi.createTenant({
      type: "reqCreateTenant",
      auth: reqEnsureUser.auth,
      tenant: {
        // ownerUserId: data[0].ress.user.userId,
      },
    });
    const user = await fpApi.ensureUser(reqEnsureUser);
    expect(user.Ok().user.maxTenants).toEqual(10);
    expect(user.Ok().tenants[0].tenant.limits).toEqual({
      maxAdminUsers: 5,
      maxMemberUsers: 5,
      maxInvites: 10,
      maxLedgers: 5,
    });

    // funky stuff with cements env implementation
    sthis.env.sets({
      MAX_ADMIN_USERS: "50",
      MAX_MEMBER_USERS: "50",
      MAX_INVITES: "100",
      MAX_LEDGERS: "50",
    });

    // const fpApi2 = new FPApiSQL(
    //   sthis,
    //   db,
    //   { clerk: new TestApiToken(sthis) },
    //   {
    //     cloudPublicKeys: [],
    //     clerkPublishableKey: "test-clerk-publishable-key",
    //     maxTenants: 50,
    //     maxAdminUsers: 50,
    //     maxMemberUsers: 50,
    //     maxInvites: 100,
    //     maxLedgers: 50,
    //     maxAppIdBindings: 50,
    //     deviceCA: deviceCA,
    //   },
    // );
    const res = await fpApi.ensureUser(reqEnsureUser);
    expect(res.Ok().user.maxTenants).toBe(10); // stays as previous until re-create
    expect(res.Ok().tenants[0].tenant.limits).toEqual({
      maxAdminUsers: 50,
      maxMemberUsers: 50,
      maxInvites: 100,
      maxLedgers: 50,
    });

    sthis.env.sets({
      MAX_ADMIN_USERS: "5",
      MAX_MEMBER_USERS: "5",
      MAX_INVITES: "10",
      MAX_LEDGERS: "5",
    });

    // sthis.env.sets(prevEnv);

    // const fpApi3 = new FPApiSQL(
    //   sthis,
    //   db,
    //   { clerk: new TestApiToken(sthis) },
    //   {
    //     cloudPublicKeys: [],
    //     clerkPublishableKey: "test-clerk-publishable-key",
    //     maxTenants: 17,
    //     maxAdminUsers: 17,
    //     maxMemberUsers: 17,
    //     maxInvites: 17,
    //     maxLedgers: 17,
    //     maxAppIdBindings: 17,
    //     deviceCA,
    //   },
    // );
    const dLimits = await fpApi.ensureUser(reqEnsureUser);
    expect(dLimits.Ok().user.maxTenants).toBe(10);
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
