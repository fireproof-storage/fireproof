import { Result } from "@adviser/cement";
import { ReqCertFromCsr, ResCertFromCsr } from "@fireproof/core-protocols-dashboard";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";

/**
 * Get certificate from CSR
 * Validates the CSR and signs it using the DeviceIdCA to create a certificate
 */
export async function getCertFromCsr(
  ctx: FPApiSQLCtx,
  req: ReqWithVerifiedAuthUser<ReqCertFromCsr>,
): Promise<Result<ResCertFromCsr>> {
  // Process the CSR using the DeviceIdCA
  const rCert = await ctx.deviceCA.processCSR(req.csr);
  if (rCert.isErr()) {
    return Result.Err(rCert.Err());
  }

  const certResult = rCert.Ok();

  // Return the signed certificate JWT
  return Result.Ok({
    type: "resCertFromCsr",
    certificate: certResult.certificateJWT,
  });
}
