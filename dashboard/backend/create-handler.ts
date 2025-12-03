// import { auth } from "./better-auth.js";
import { CoercedHeadersInit, HttpHeader, Lazy, LoggerImpl, Result, exception2Result, param } from "@adviser/cement";
import { FPDeviceIDSessionSchema, SuperThis, SuperThisOpts } from "@fireproof/core";
import { FPAPIMsg, FPApiSQL, FPApiToken } from "./api.js";
import type { Env } from "./cf-serve.js";
import { FPClerkClaim, FPClerkClaimSchema, VerifiedAuth } from "@fireproof/core-protocols-dashboard";
import { ensureSuperThis, ensureLogger, coerceInt, sts } from "@fireproof/core-runtime";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { ResultSet } from "@libsql/client";
import { getCloudPubkeyFromEnv } from "./get-cloud-pubkey-from-env.js";
import { DeviceIdCA, DeviceIdVerifyMsg, VerifyWithCertificateOptions } from "@fireproof/core-device-id";
import { verifyToken as ClerkVerifyToken } from "@clerk/backend";
import { exportSPKI } from "jose";

const defaultHttpHeaders = Lazy(() =>
  HttpHeader.from({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
    "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  }),
);

export function DefaultHttpHeaders(...h: CoercedHeadersInit[]): HeadersInit {
  return defaultHttpHeaders()
    .Merge(...h)
    .AsHeaderInit();
}

class ClerkApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }
  async verify(token: string): Promise<Result<VerifiedAuth>> {
    const keys: string[] = [];
    const urls: string[] = [];
    // eslint-disable-next-line no-constant-condition
    for (let idx = 0; true; idx++) {
      const suffix = !idx ? "" : `_${idx}`;
      const key = `CLERK_PUB_JWT_KEY${suffix}`;
      const url = `CLERK_PUB_JWT_URL${suffix}`;
      const rEnvVal = this.sthis.env.gets({
        [key]: param.OPTIONAL,
        [url]: param.OPTIONAL,
      });
      if (rEnvVal.isErr()) {
        return Result.Err(rEnvVal.Err());
      }
      const { [key]: keyVal, [url]: urlVal } = rEnvVal.Ok();
      if (!keyVal && !urlVal) {
        // end loop of CLERK_PUB_JWT_KEYn and CLERK_PUB_JWT_URLn
        break;
      }
      if (keyVal) {
        keys.push(keyVal);
      }
      if (urlVal) {
        urls.push(
          ...urlVal
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u),
        );
      }
    }
    this.sthis.logger.Debug().Str("keys-count", keys.length.toString()).Str("urls-count", urls.length.toString()).Msg("ClerkApiToken.verify: attempting token verification");
    if (keys.length > 0) {
      this.sthis.logger.Debug().Str("first-key-preview", keys[0].substring(0, 50) + "...").Msg("ClerkApiToken.verify: using keys");
    }
    if (urls.length > 0) {
      this.sthis.logger.Debug().Str("urls", JSON.stringify(urls)).Msg("ClerkApiToken.verify: using URLs");
    }
    const rt = await sts.verifyToken(token, keys, urls, {
      parseSchema: (payload: unknown): Result<FPClerkClaim> => {
        const r = FPClerkClaimSchema.safeParse(payload);
        if (r.success) {
          return Result.Ok(r.data);
        } else {
          return Result.Err(r.error);
        }
      },
      verifyToken: async (token, key) => {
        const rPublicKey = await sts.importJWK(key, "RS256");
        if (rPublicKey.isErr()) {
          return Result.Err(rPublicKey);
        }
        const pem = await exportSPKI(rPublicKey.Ok().key);
        const r = await exception2Result(() =>
          ClerkVerifyToken(token, {
            jwtKey: pem,
            // authorizedParties: ["http://localhost:7370"],
          }),
        );
        if (r.isErr()) {
          return Result.Err(r);
        }
        if (!r.Ok()) {
          return Result.Err("ClerkVerifyToken: failed");
        }
        return Result.Ok({
          payload: r.Ok(),
        });
      },
    });
    if (rt.isErr()) {
      this.sthis.logger.Error().Str("error", rt.Err().toString()).Msg("ClerkApiToken.verify: verification failed");
      return Result.Err(rt.Err());
    }
    const t = rt.Ok();
    return Result.Ok({
      type: "clerk",
      token,
      userId: t.sub,
      provider: "TBD",
      params: {
        ...t.params,
      },
    });
  }
}

const rDeviceIdCA = Lazy((sthis: SuperThis) => {
  const rEnv = sthis.env.gets({
    DEVICE_ID_CA_PRIV_KEY: param.REQUIRED,
    DEVICE_ID_CA_CERT: param.REQUIRED,
  });
  if (rEnv.isErr()) {
    throw rEnv.Err();
  }
  const envVals = rEnv.Ok();
  return DeviceIdCA.from(
    sthis,
    {
      privateKey: envVals.DEVICE_ID_CA_PRIV_KEY,
      signedCert: envVals.DEVICE_ID_CA_CERT,
    },
    {
      generateSerialNumber: async () => sthis.nextId(32).str,
    },
  );
});

class DeviceIdApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  readonly opts: VerifyWithCertificateOptions;
  constructor(sthis: SuperThis, opts: VerifyWithCertificateOptions) {
    this.sthis = sthis;
    this.opts = opts;
  }
  async verify(token: string): Promise<Result<VerifiedAuth>> {
    const rCA = await rDeviceIdCA(this.sthis);
    if (rCA.isErr()) {
      return Result.Err(rCA.Err());
    }
    const verify = new DeviceIdVerifyMsg(this.sthis.txt.base64, [(await rCA.Ok().caCertificate()).Ok()], {
      maxAge: 3600,
      ...this.opts,
    });

    const res = await verify.verifyWithCertificate(token, FPDeviceIDSessionSchema);
    if (res.valid) {
      return Result.Ok({
        type: "device-id",
        token,
        userId: res.payload.deviceId,
        provider: "device-id",
        params: {},
      });
    }
    return Result.Err(res.error);
  }
}

// class BetterApiToken implements FPApiToken {
//   readonly sthis: SuperThis;
//   readonly pk?: JWK;
//   constructor(sthis: SuperThis) {
//     this.sthis = sthis;
//     try {
//       this.pk = JSON.parse(this.sthis.env.get("BETTER_PUBLICSHABLE_KEY")!) as JWK;
//     } catch (e) {
//       this.sthis.logger.Error().Err(e).Msg("Invalid BETTER_PUBLICSHABLE_KEY");
//     }
//   }
//   async verify(token: string): Promise<Result<VerifiedAuth>> {
//     if (!this.pk) {
//       return Result.Err("Invalid BETTER_PUBLICSHABLE_KEY");
//     }
//     const rAuth = await jwtVerify(token, this.pk);
//     console.log("rAuth", rAuth);
//     if (!rAuth || !rAuth.payload.sub) {
//       return Result.Err("invalid token");
//     }
//     const params = (rAuth.payload as { params: ClerkClaim }).params;
//     return Result.Ok({
//       type: "better",
//       provider: "better",
//       token,
//       userId: rAuth.payload.sub as string,
//       params,
//     });
//   }
// }

export type DashSqlite = BaseSQLiteDatabase<"async", ResultSet | D1Result, Record<string, never>>;

const tokenApi = Lazy(async (sthis: SuperThis) => {
  // const rDeviceIdCA = await DeviceIdCA.from(sthis, {
  //   privateKeyEnv: "DEVICE_ID_CA_PRIV_KEY",
  //   signedCertEnv: "DEVICE_ID_CA_CERT",
  // }, {
  //   generateSerialNumber: async () => sthis.nextId(32).str,
  // });
  return {
    "device-id": new DeviceIdApiToken(sthis, {
      clockTolerance: 60,
    }),
    clerk: new ClerkApiToken(sthis),
  };
});

// BaseSQLiteDatabase<'async', ResultSet, TSchema>
export async function createHandler<T extends DashSqlite>(db: T, env: Record<string, string> | Env) {
  // const stream = new utils.ConsoleWriterStream();
  const sthis = ensureSuperThis({
    logger: new LoggerImpl(),
  } as unknown as SuperThisOpts);
  // try {
  //   if (import.meta && import.meta.env) {
  //     sthis.env.sets(import.meta.env as unknown as Record<string, string>);
  //   }
  // } catch (e) {
  //   sthis.logger.Error().Err(e).Msg("Error setting import.meta.env");
  // }
  sthis.env.sets(env as unknown as Record<string, string>);
  const rEnvVals = sthis.env.gets({
    CLOUD_SESSION_TOKEN_PUBLIC: param.REQUIRED,
    CLERK_PUBLISHABLE_KEY: param.REQUIRED,
    DEVICE_ID_CA_PRIV_KEY: param.REQUIRED,
    DEVICE_ID_CA_CERT: param.REQUIRED,
  });
  if (rEnvVals.isErr()) {
    throw rEnvVals.Err();
  }
  const envVals = rEnvVals.Ok();

  const rCloudPublicKey = await getCloudPubkeyFromEnv(envVals.CLOUD_SESSION_TOKEN_PUBLIC, sthis);
  if (rCloudPublicKey.isErr()) {
    throw rCloudPublicKey.Err();
  }

  // Create DeviceIdCA from environment variables
  const rDeviceIdCA = await DeviceIdCA.from(
    sthis,
    {
      privateKey: envVals.DEVICE_ID_CA_PRIV_KEY,
      signedCert: envVals.DEVICE_ID_CA_CERT,
    },
    {
      generateSerialNumber: async () => sthis.nextId(32).str,
    },
  );

  if (rDeviceIdCA.isErr()) {
    throw rDeviceIdCA.Err();
  }

  const logger = ensureLogger(sthis, "createHandler");
  const fpApi = new FPApiSQL(sthis, db, await tokenApi(sthis), {
    cloudPublicKeys: rCloudPublicKey.Ok().keys,
    clerkPublishableKey: envVals.CLERK_PUBLISHABLE_KEY,
    maxTenants: coerceInt(env.MAX_TENANTS, 10),
    maxAdminUsers: coerceInt(env.MAX_ADMIN_USERS, 5),
    maxMemberUsers: coerceInt(env.MAX_MEMBER_USERS, 5),
    maxInvites: coerceInt(env.MAX_INVITES, 10),
    maxLedgers: coerceInt(env.MAX_LEDGERS, 5),
    deviceCA: rDeviceIdCA.Ok(),
  });
  return async (req: Request): Promise<Response> => {
    const startTime = performance.now();
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: DefaultHttpHeaders({ "Content-Type": "application/json" }),
      });
    }
    if (!["POST", "PUT"].includes(req.method)) {
      return new Response("Invalid request", { status: 404, headers: DefaultHttpHeaders() });
    }
    const rJso = await exception2Result(async () => await req.json());
    if (rJso.isErr()) {
      logger.Error().Err(rJso.Err()).Msg("createhandler-Error");
      return new Response("Invalid request", { status: 404, headers: DefaultHttpHeaders() });
    }
    const jso = rJso.Ok();

    // console.log(jso);
    let res: Promise<Result<unknown>>;
    switch (true) {
      case FPAPIMsg.isDeleteTenant(jso):
        res = fpApi.deleteTenant(jso);
        break;
      case FPAPIMsg.isUpdateTenant(jso):
        res = fpApi.updateTenant(jso);
        break;
      case FPAPIMsg.isCreateTenant(jso):
        res = fpApi.createTenant(jso);
        break;
      case FPAPIMsg.isDeleteInvite(jso):
        res = fpApi.deleteInvite(jso);
        break;
      case FPAPIMsg.isListInvites(jso):
        res = fpApi.listInvites(jso);
        break;
      case FPAPIMsg.isInviteUser(jso):
        res = fpApi.inviteUser(jso);
        break;
      case FPAPIMsg.isFindUser(jso):
        res = fpApi.findUser(jso);
        break;
      case FPAPIMsg.isRedeemInvite(jso):
        res = fpApi.redeemInvite(jso);
        break;
      case FPAPIMsg.isEnsureUser(jso):
        res = fpApi.ensureUser(jso);
        break;
      case FPAPIMsg.isListTenantsByUser(jso):
        res = fpApi.listTenantsByUser(jso);
        break;
      case FPAPIMsg.isUpdateUserTenant(jso):
        res = fpApi.updateUserTenant(jso);
        break;
      case FPAPIMsg.isListLedgersByUser(jso):
        res = fpApi.listLedgersByUser(jso);
        break;

      case FPAPIMsg.isCreateLedger(jso):
        res = fpApi.createLedger(jso);
        break;

      case FPAPIMsg.isUpdateLedger(jso):
        res = fpApi.updateLedger(jso);
        break;

      case FPAPIMsg.isDeleteLedger(jso):
        res = fpApi.deleteLedger(jso);
        break;

      case FPAPIMsg.isCloudSessionToken(jso):
        res = fpApi.getCloudSessionToken(jso);
        break;

      case FPAPIMsg.isReqTokenByResultId(jso):
        res = fpApi.getTokenByResultId(jso);
        break;

      case FPAPIMsg.isReqExtendToken(jso):
        res = fpApi.extendToken(jso);
        break;

      case FPAPIMsg.isReqCertFromCsr(jso):
        res = fpApi.getCertFromCsr(jso);
        break;

      default:
        return new Response("Invalid request", { status: 400, headers: DefaultHttpHeaders() });
    }
    try {
      const rRes = await res;
      // console.log("Response", rRes);
      if (rRes.isErr()) {
        logger.Error().Any({ request: jso.type }).Err(rRes).Msg("Result-Error");
        const endTime = performance.now();
        const duration = endTime - startTime;
        return new Response(
          JSON.stringify({
            type: "error",
            message: rRes.Err().message,
          }),
          {
            status: 500,
            headers: DefaultHttpHeaders({
              "Server-Timing": `total;dur=${duration.toFixed(2)}`,
            }),
          },
        );
      }
      logger
        .Info()
        .Any({ request: jso.type, response: (rRes.Ok() as { type: string }).type })
        .Msg("Success");
      const endTime = performance.now();
      const duration = endTime - startTime;
      return new Response(JSON.stringify(rRes.Ok()), {
        status: 200,
        headers: {
          ...DefaultHttpHeaders,
          "Content-Type": "application/json",
          "Server-Timing": `total;dur=${duration.toFixed(2)}`,
        },
      });
    } catch (e) {
      logger.Error().Any({ request: jso.type }).Err(e).Msg("global-Error");
      const endTime = performance.now();
      const duration = endTime - startTime;
      return new Response(
        JSON.stringify({
          type: "error",
          message: (e as Error).message,
        }),
        {
          status: 500,
          headers: {
            ...DefaultHttpHeaders,
            "Content-Type": "application/json",
            "Server-Timing": `total;dur=${duration.toFixed(2)}`,
          },
        },
      );
    }
  };
}
