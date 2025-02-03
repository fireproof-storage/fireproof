import { verifyToken } from "@clerk/backend";
import { SuperThis, Result, ensureSuperThis, ensureLogger } from "use-fireproof";
import { FPApiToken, FPApiSQL, FPAPIMsg } from "./api.ts";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { ClerkClaim, VerifiedAuth } from "./users.ts";
import { auth } from "./better-auth.ts";
import { URI } from "@adviser/cement";
import { jwtVerify } from "jose/jwt/verify";
import { JWK } from "jose";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
  "Access-Control-Max-Age": "86400",
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
    const t = (await verifyToken(token, {
      // audience: "http://localhost:5173",
      // issuer: 'https://trusted-glowworm-5.clerk.accounts.dev',
      secretKey: this.sthis.env.get("CLERK_SECRET_KEY"),
    })) as unknown as ClerkTemplate;
    if (!t) {
      return Result.Err("Invalid token");
    }
    // console.log(t);
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

class BetterApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  readonly pk?: JWK;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    try {
      this.pk = JSON.parse(this.sthis.env.get("BETTER_PUBLICSHABLE_KEY")!) as JWK;
    } catch (e) {
      this.sthis.logger.Error().Err(e).Msg("Invalid BETTER_PUBLICSHABLE_KEY");
    }
  }
  async verify(token: string): Promise<Result<VerifiedAuth>> {
    if (!this.pk) {
      return Result.Err("Invalid BETTER_PUBLICSHABLE_KEY");
    }
    const rAuth = await jwtVerify(token, this.pk);
    console.log("rAuth", rAuth);
    if (!rAuth || !rAuth.payload.sub) {
      return Result.Err("invalid token");
    }
    const params = (rAuth.payload as { params: ClerkClaim }).params;
    return Result.Ok({
      type: "better",
      provider: "better",
      token,
      userId: rAuth.payload.sub as string,
      params,
    });
  }
}

export function createHandler<T extends LibSQLDatabase>(db: T) {
  const sthis = ensureSuperThis();
  const logger = ensureLogger(sthis, "createHandler");
  const fpApi = new FPApiSQL(sthis, db, {
    clerk: new ClerkApiToken(sthis),
    better: new BetterApiToken(sthis),
  });
  return async (req: Request): Promise<Response> => {
    const uri = URI.from(req.url);
    if (uri.pathname.startsWith("/api/auth/")) {
      const res = await auth.handler(req);
      // for (const [key, value] of Object.entries(CORS)) {
      //   res.headers.set(key, value);
      // }
      console.log("Request", uri.pathname, res.status, res.statusText);
      return res;
    }
    const out = {} as {
      ensureUserRef: unknown;
      listTenantsByUser: unknown;
    };
    const jso = await req.json();
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

      default:
        return new Response("Invalid request", { status: 400, headers: CORS });
    }
    try {
      const rRes = await res;
      // console.log("Response", rRes);
      if (rRes.isErr()) {
        logger.Error().Any({ request: jso.type }).Err(rRes).Msg("Result-Error");
        return new Response(
          JSON.stringify({
            type: "error",
            message: rRes.Err().message,
          }),
          { status: 500, headers: CORS },
        );
      }
      logger
        .Info()
        .Any({ request: jso.type, response: (rRes.Ok() as { type: string }).type })
        .Msg("Success");
      return new Response(JSON.stringify(rRes.Ok()), { status: 200, headers: CORS });
    } catch (e) {
      logger.Error().Any({ request: jso.type }).Err(e).Msg("Error");
      return new Response(
        JSON.stringify({
          type: "error",
          message: (e as Error).message,
        }),
        { status: 500, headers: CORS },
      );
    }
  };
}
