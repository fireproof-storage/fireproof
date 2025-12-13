import { Result } from "@adviser/cement";
import { ReqCertFromCsr, ResCertFromCsr } from "@fireproof/core-protocols-dashboard";
import { UserNotFoundError } from "../sql/users.js";
import { activeUser } from "../internal/auth.js";
import { FPApiSQLCtx } from "../types.js";

/**
 * Get certificate from CSR
 * Validates the CSR and signs it using the DeviceIdCA to create a certificate
 */
export async function getCertFromCsr(ctx: FPApiSQLCtx, req: ReqCertFromCsr): Promise<Result<ResCertFromCsr>> {
  // Verify user authentication
  const rAuth = await activeUser(ctx, req);
  if (rAuth.isErr()) {
    return Result.Err(rAuth.Err());
  }
  const auth = rAuth.Ok();
  if (!auth.user) {
    return Result.Err(new UserNotFoundError());
  }

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
