import { Logger, exception2Result, Result } from "@adviser/cement";
import { FPCloudClaimSchema, TokenAndClaims } from "@fireproof/core-types-protocols-cloud";
import { jwtVerify } from "jose";
import { JWKPublic } from "@fireproof/core-types-base";

export async function convertToTokenAndClaims(
  dashApi: {
    getClerkPublishableKey(): Promise<{ cloudPublicKeys: JWKPublic[] }>;
  },
  logger: Logger,
  token: string,
): Promise<Result<TokenAndClaims>> {
  for (const jwkPublic of await dashApi.getClerkPublishableKey().then((r) => r.cloudPublicKeys)) {
    const rUnknownClaims = await exception2Result(() => jwtVerify(token, jwkPublic));
    if (rUnknownClaims.isErr() || !rUnknownClaims.Ok()?.payload) {
      logger
        .Warn()
        .Err(rUnknownClaims)
        .Any({
          kid: jwkPublic.kid,
        })
        .Msg("Token failed");
      continue;
    }
    const rFPCloudClaim = FPCloudClaimSchema.safeParse(rUnknownClaims.Ok().payload);
    if (!rFPCloudClaim.success) {
      logger.Warn().Err(rFPCloudClaim.error).Msg("Token claims validation failed");
      continue;
    }
    return Result.Ok({
      token,
      claims: rFPCloudClaim.data,
    });
  }
  return Result.Err("No valid JWK found to verify token");
}
