// import { auth } from "./better-auth.ts";
import { exception2Result, LoggerImpl, Result, URI, utils } from "@adviser/cement";
import { verifyToken } from "@clerk/backend";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { SuperThis, SuperThisOpts, ensureLogger, ensureSuperThis } from "@fireproof/core";
import { FPAPIMsg, FPApiSQL, FPApiToken } from "./api.ts";
import { VerifiedAuth } from "./users.ts";
import type { Env } from "./cf-serve.ts";
// import { jwtVerify } from "jose/jwt/verify";
// import { JWK } from "jose";

export const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
  "Access-Control-Max-Age": "86400",
  "X-Frame-Options": "ALLOW-FROM *",
};

interface ClerkTemplate {
  readonly app_metadata: {};
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
    const jwtKey = this.sthis.env.get("CLERK_PUB_JWT_KEY");
    if (!jwtKey) {
      return Result.Err("Invalid CLERK_PUB_JWT_KEY");
    }
    const rt = await exception2Result(async () => {
      return (await verifyToken(token, { jwtKey })) as unknown as ClerkTemplate;
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

export function createHandler<T extends LibSQLDatabase>(db: T, env: Record<string, string> | Env) {
  // const stream = new utils.ConsoleWriterStream();
  const sthis = ensureSuperThis({
    logger: new LoggerImpl(),
  } as unknown as SuperThisOpts);
  sthis.env.sets(env as unknown as Record<string, string>);
  const logger = ensureLogger(sthis, "createHandler");
  const fpApi = new FPApiSQL(sthis, db, {
    clerk: new ClerkApiToken(sthis),
    // better: new BetterApiToken(sthis),
  });
  return async (req: Request): Promise<Response> => {
    const startTime = performance.now();
    if (!["POST", "PUT"].includes(req.method)) {
      return new Response("Invalid request", { status: 404, headers: CORS });
    }
    const rJso = await exception2Result(async () => await req.json());
    if (rJso.isErr()) {
      logger.Error().Err(rJso.Err()).Msg("Error");
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
          "Server-Timing": `total;dur=${duration.toFixed(2)}`,
        },
      });
    } catch (e) {
      logger.Error().Any({ request: jso.type }).Err(e).Msg("Error");
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
            "Server-Timing": `total;dur=${duration.toFixed(2)}`,
          },
        },
      );
    }
  };
}
