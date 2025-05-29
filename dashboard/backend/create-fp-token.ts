import { param, Result } from "@adviser/cement";
import { rt, ps, SuperThis } from "@fireproof/core";
import { SignJWT } from "jose/jwt/sign";

export interface FPTokenContext {
  readonly secretToken: string;
  readonly publicToken: string;
  readonly issuer: string;
  readonly audience: string;
  readonly validFor: number; // seconds
  readonly extendValidFor: number; // seconds
}

export async function createFPToken(ctx: FPTokenContext, claim: ps.cloud.FPCloudClaim) {
  const privKey = await rt.sts.env2jwk(ctx.secretToken, "ES256");
  let validFor = ctx.validFor;
  if (validFor <= 0) {
    validFor = 60 * 60; // 1 hour
  }
  return new SignJWT(claim)
    .setProtectedHeader({ alg: "ES256" }) // algorithm
    .setIssuedAt()
    .setIssuer(ctx.issuer) // issuer
    .setAudience(ctx.audience) // audience
    .setExpirationTime(Math.floor((Date.now() + validFor * 1000) / 1000)) // expiration time
    .sign(privKey);
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
  });
}
