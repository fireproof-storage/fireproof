import { ClerkClaim, ClerkVerifyAuth } from "@fireproof/core-protocols-dashboard";
import { FPCloudClaim } from "@fireproof/core-types-protocols-cloud";
import { param, Result } from "@adviser/cement";
import { SuperThis } from "@fireproof/core";
import { sts } from "@fireproof/core-runtime";
import { SignJWT } from "jose/jwt/sign";
import { ActiveUserWithUserId, FPTokenContext } from "../types.js";

export async function createFPToken(ctx: FPTokenContext, claim: FPCloudClaim) {
  const privKeys = await sts.env2jwk(ctx.secretToken);
  if (privKeys.length !== 1) {
    throw new Error(`Expected exactly one private JWK, found ${privKeys.length}`);
  }
  const privKey = privKeys[0];
  let validFor = ctx.validFor;
  if (validFor <= 0) {
    validFor = 60 * 60; // 1 hour
  }
  const expiresDate = new Date(Date.now() + validFor * 1000); // epoch sec
  const expiresInSec = Math.floor((Math.floor(expiresDate.getTime() / 1000) + validFor) / 1000);
  const epochExp = Math.floor(expiresDate.getTime() / 1000);
  return {
    expiresDate,
    expiresInSec,
    token: await new SignJWT(claim)
      .setProtectedHeader({ alg: "ES256" }) // algorithm
      .setIssuedAt()
      .setIssuer(ctx.issuer) // issuer
      .setAudience(ctx.audience) // audience
      .setExpirationTime(epochExp) // expiration time
      .sign(privKey),
  };
}

export async function getFPTokenContext(sthis: SuperThis, ictx: Partial<FPTokenContext> = {}): Promise<Result<FPTokenContext>> {
  const rCtx = sthis.env.gets({
    CLOUD_SESSION_TOKEN_SECRET: ictx.secretToken ?? param.REQUIRED,
    CLOUD_SESSION_TOKEN_PUBLIC: ictx.publicToken ?? param.REQUIRED,
    CLOUD_SESSION_TOKEN_ISSUER: "FP_CLOUD",
    CLOUD_SESSION_TOKEN_AUDIENCE: "PUBLIC",
    CLOUD_SESSION_TOKEN_VALID_FOR: "" + 60 * 60,
    CLOUD_SESSION_TOKEN_EXTEND_VALID_FOR: "" + 6 * 60 * 60,
  });
  if (rCtx.isErr()) {
    return Result.Err(rCtx.Err());
  }
  const ctx = rCtx.Ok();
  return Result.Ok({
    secretToken: ctx.CLOUD_SESSION_TOKEN_SECRET,
    publicToken: ctx.CLOUD_SESSION_TOKEN_PUBLIC,
    issuer: ctx.CLOUD_SESSION_TOKEN_ISSUER,
    audience: ctx.CLOUD_SESSION_TOKEN_AUDIENCE,
    validFor: parseInt(ctx.CLOUD_SESSION_TOKEN_VALID_FOR, 10),
    extendValidFor: parseInt(ctx.CLOUD_SESSION_TOKEN_EXTEND_VALID_FOR, 10),
    ...ictx,
  } satisfies FPTokenContext);
}

export function nameFromAuth(name: string | undefined, auth: ActiveUserWithUserId): string {
  return name ?? `${auth.verifiedAuth.params.email ?? nickFromClarkClaim(auth.verifiedAuth.params) ?? auth.verifiedAuth.userId}`;
}

export function nickFromClarkClaim(auth: ClerkClaim): string | undefined {
  return auth.nick ?? auth.name;
}

export function toProvider(i: ClerkVerifyAuth): FPCloudClaim["provider"] {
  if (i.params.nick) {
    return "github";
  }
  return "google";
}
