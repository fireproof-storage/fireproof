// import { auth } from "./better-auth.js";
import { LoggerImpl, Result, exception2Result, param } from "@adviser/cement";
import { verifyToken } from "@clerk/backend";
import { verifyJwt } from "@clerk/backend/jwt";
import { SuperThis, SuperThisOpts } from "@fireproof/core";
import { FPAPIMsg, FPApiSQL, FPApiToken } from "./api.js";
import type { Env } from "./cf-serve.js";
import { VerifiedAuth } from "@fireproof/core-protocols-dashboard";
import { ensureSuperThis, ensureLogger } from "@fireproof/core-runtime";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { ResultSet } from "@libsql/client";
// import { jwtVerify } from "jose/jwt/verify";
// import { JWK } from "jose";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
  "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

interface ClerkTemplate {
  readonly app_metadata: unknown;
  readonly azp: string;
  readonly exp: number;
  readonly iat: number;
  readonly iss: string;
  readonly jti: string;
  readonly nbf: number;
  readonly role: string;
  readonly sub: string;
  readonly params: {
    readonly email: string;
    readonly first: string;
    readonly last: string;
    readonly name: null;
  };
}

class ClerkApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }
  async verify(token: string): Promise<Result<VerifiedAuth>> {
    const rEnvVal = this.sthis.env.gets({
      CLERK_PUB_JWT_KEY: param.OPTIONAL,
      CLERK_PUB_JWT_URL: param.OPTIONAL,
    });
    if (rEnvVal.isErr()) {
      return Result.Err(rEnvVal.Err());
    }
    const { CLERK_PUB_JWT_KEY, CLERK_PUB_JWT_URL } = rEnvVal.Ok();
    if (!CLERK_PUB_JWT_URL && !CLERK_PUB_JWT_KEY) {
      return Result.Err("You must set CLERK_PUB_JWT_URL or CLERK_PUB_JWT_KEY");
    }

    const rt = await exception2Result(async () => {
      if (CLERK_PUB_JWT_KEY) {
        const rCt = await exception2Result(
          async () => (await verifyToken(token, { jwtKey: CLERK_PUB_JWT_KEY })) as unknown as ClerkTemplate,
        );
        if (rCt.isOk()) {
          return rCt.Ok();
        }
      }
      if (CLERK_PUB_JWT_URL) {
        // Validate URL format and security
        if (!CLERK_PUB_JWT_URL.startsWith("https://")) {
          throw new Error("CLERK_PUB_JWT_URL(${CLERK_PUB_JWT_URL}) must use HTTPS");
        }
        const rJwtKey = await exception2Result(
          async () =>
            await fetch(CLERK_PUB_JWT_URL, {
              method: "GET",
              signal: AbortSignal.timeout(5000), // 5 second timeout
            }),
        );
        if (rJwtKey.isOk() && rJwtKey.Ok().ok) {
          const rCt = await exception2Result(async () => {
            const jwsPubKey = await rJwtKey.Ok().json<JsonWebKey>();
            return (await verifyJwt(token, { key: jwsPubKey })) as unknown as ClerkTemplate;
          });
          if (rCt.isOk()) {
            return rCt.Ok();
          } else {
            throw new Error(`verifyJwt failed ${rCt.Err()} from ${CLERK_PUB_JWT_URL}`);
          }
        }
      }
      throw new Error(
        "You must set CLERK_PUB_JWT_URL(${CLERK_PUB_JWT_URL}) verify with CLERK_PUB_JWT_KEY(${CLERK_PUB_JWT_KEY}) failed",
      );
    });
    if (rt.isErr()) {
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

// BaseSQLiteDatabase<'async', ResultSet, TSchema>
export function createHandler<T extends DashSqlite>(db: T, env: Record<string, string> | Env) {
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
  const logger = ensureLogger(sthis, "createHandler");
  const fpApi = new FPApiSQL(sthis, db, {
    clerk: new ClerkApiToken(sthis),
    // better: new BetterApiToken(sthis),
  });
  return async (req: Request): Promise<Response> => {
    const startTime = performance.now();
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json",
        },
      });
    }
    if (!["POST", "PUT"].includes(req.method)) {
      return new Response("Invalid request", { status: 404, headers: CORS });
    }
    const rJso = await exception2Result(async () => await req.json());
    if (rJso.isErr()) {
      logger.Error().Err(rJso.Err()).Msg("createhandler-Error");
      return new Response("Invalid request", { status: 404, headers: CORS });
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

      default:
        return new Response("Invalid request", { status: 400, headers: CORS });
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
            headers: {
              ...CORS,
              "Server-Timing": `total;dur=${duration.toFixed(2)}`,
            },
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
          ...CORS,
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
            ...CORS,
            "Content-Type": "application/json",
            "Server-Timing": `total;dur=${duration.toFixed(2)}`,
          },
        },
      );
    }
  };
}
