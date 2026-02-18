import { EventoHandler, Result, EventoResultType, HandleTriggerCtx } from "@adviser/cement";
import { ReqCertFromCsr, ResCertFromCsr, validateCertFromCsr } from "@fireproof/core-types-protocols-dashboard";
import { FPApiSQLCtx, ReqWithVerifiedAuthUser } from "../types.js";
import { checkAuth, wrapStop } from "../utils/index.js";

/**
 * Get certificate from CSR
 * Validates the CSR and signs it using the DeviceIdCA to create a certificate
 */
async function getCertFromCsr(ctx: FPApiSQLCtx, req: ReqWithVerifiedAuthUser<ReqCertFromCsr>): Promise<Result<ResCertFromCsr>> {
  // Process the CSR using the DeviceIdCA
  const rCert = await ctx.deviceCA.processCSR(req.csr, req.auth.verifiedAuth.claims);
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

export const getCertFromCsrItem: EventoHandler<Request, ReqCertFromCsr, ResCertFromCsr> = {
  hash: "get-cert-from-csr",
  validate: (ctx) => validateCertFromCsr(ctx.enRequest),
  handle: checkAuth(
    async (
      ctx: HandleTriggerCtx<Request, ReqWithVerifiedAuthUser<ReqCertFromCsr>, ResCertFromCsr>,
    ): Promise<Result<EventoResultType>> => {
      const res = await getCertFromCsr(ctx.ctx.getOrThrow("fpApiCtx"), ctx.validated);
      if (res.isErr()) {
        return Result.Err(res);
      }
      return wrapStop(ctx.send.send(ctx, res.Ok()));
    },
  ),
};
