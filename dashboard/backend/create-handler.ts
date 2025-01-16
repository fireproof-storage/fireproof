import { verifyToken } from "@clerk/backend";
import { SuperThis, Result, ensureSuperThis } from "use-fireproof";
import { FPApiToken, VerifiedAuth, FPApiImpl } from "./api.ts";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

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
      audience: "http://localhost:5173",
      // issuer: 'https://trusted-glowworm-5.clerk.accounts.dev',
      secretKey: "sk_test_In7uA3eMUvywLuUybkNZNAMdMTSiWUdT38KrPZzerr",
    })) as unknown as ClerkTemplate;
    if (!t) {
      return Result.Err("Invalid token");
    }
    console.log(t);
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

export function createHandler<T extends LibSQLDatabase>(db: T) {
  const sthis = ensureSuperThis();
  const fpApi = new FPApiImpl(sthis, db, new ClerkApiToken(sthis));
  return async (req: Request): Promise<Response> => {
    const out = {} as {
      ensureUserRef: unknown;
      listTenantsByUser: unknown;
    };
    const jso = await req.json();
    console.log(jso);
    const auth = jso.auth;
    {
      const rRes = await fpApi.ensureUserRef({
        type: "reqEnsureUserRef",
        auth,
      });
      if (rRes.isErr()) {
        return new Response(rRes.Err().message, { status: 400, headers: CORS });
      }
      out.ensureUserRef = rRes.Ok();
    }
    {
      const rRes = await fpApi.listTenantsByUser({
        type: "reqListTenantsByUser",
        auth,
      });
      if (rRes.isErr()) {
        return new Response(rRes.Err().message, { status: 400, headers: CORS });
      }
      out.listTenantsByUser = rRes.Ok();
    }
    return new Response(JSON.stringify(out), { status: 200, headers: CORS });
  };
}
