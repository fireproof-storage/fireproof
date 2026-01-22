import { ClerkClaim } from "@fireproof/core-types-base";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { verifyAuth } from "../utils/auth.js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql/driver";
import { ensureSuperThis } from "@fireproof/core-runtime";
import { createFPApiSQLCtx } from "../api.js";
import { Result } from "@adviser/cement";
import { decodeJwt } from "jose";
import { VerifiedClaimsResult } from "@fireproof/core-types-protocols-dashboard";
import { createTestDeviceCA } from "@fireproof/core-device-id";

const clerkToken =
  "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18yb2x6SjRyUndjUTVsUGJLTkNZZHdKNEdyRlEiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjczNzAiLCJleHAiOjE3Njc5NTgyNTUsImlhdCI6MTc2Nzk1ODE5NSwiaXNzIjoiaHR0cHM6Ly9wcmVjaXNlLWNvbHQtNDkuY2xlcmsuYWNjb3VudHMuZGV2IiwianRpIjoiNzkwMDY0Y2IzN2FlNWI5NzU0MTMiLCJuYmYiOjE3Njc5NTgxOTAsInBhcmFtcyI6eyJlbWFpbCI6Im1lbm8uYWJlbHNAYWR2aXNlci5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZXh0ZXJuYWxfaWQiOm51bGwsImZpcnN0IjoiTWVubyIsImltYWdlX3VybCI6Imh0dHBzOi8vaW1nLmNsZXJrLmNvbS9leUowZVhCbElqb2ljSEp2ZUhraUxDSnpjbU1pT2lKb2RIUndjem92TDJsdFlXZGxjeTVqYkdWeWF5NWtaWFl2YjJGMWRHaGZaMmwwYUhWaUwybHRaMTh5ZGpWWk1GTkxNVFY1U25KQ1IydG9Na2hWWkVObmNGaEllVllpZlEiLCJsYXN0IjoiQWJlbHMiLCJuYW1lIjoibWFiZWxzIiwicHVibGljX21ldGEiOnt9fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiJ1c2VyXzJ2NVkwU0NtdTZvQ2NJT0lNQVhPeGV5VTVscyIsInVzZXJJZCI6InVzZXJfMnY1WTBTQ211Nm9DY0lPSU1BWE94ZXlVNWxzIn0.Ylo-1hqo7cNkrV5k8b4UZIE4ePHw235dFRAwFQ_G-JZ4BVZt0gXdJYK55jVWE7w4grd2ix9by347clIKABGAIgY1hAecbdqL3sStedCWw5zPyCVFWHmT6LBGC8r_m-lV0L1ZEk58fWOx_jJbw_p9I9pMu2jSdCpMIJIe9XVEvdYKxxyYWDPokbPDQG3cwhBZDaZBmZtTrrPZb6edm4UfcfacNc_mSidNO9qdrk6cEPZ8mD8x9TMoMKKCXtKvxuBeD6_-x9hEeNOSdh-MtihyR8DV0_t27Us671OpYw1hNz-bfNN6rgbOHu8i0ZIJPaCtsCDi1-y3TRRXYYvLtSXjHg";
const claims = {
  azp: "http://localhost:7370",
  exp: 1767958255,
  iat: 1767958195,
  iss: "https://precise-colt-49.clerk.accounts.dev",
  jti: "790064cb37ae5b975413",
  nbf: 1767958190,
  params: {
    email: "meno.abels@adviser.com",
    email_verified: true,
    external_id: null,
    first: "Meno",
    image_url:
      "https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvb2F1dGhfZ2l0aHViL2ltZ18ydjVZMFNLMTV5SnJCR2toMkhVZENncFhIeVYifQ",
    last: "Abels",
    name: "mabels",
    public_meta: {},
  },
  role: "authenticated",
  sub: "user_2v5Y0SCmu6oCcIOIMAXOxeyU5ls",
  userId: "user_2v5Y0SCmu6oCcIOIMAXOxeyU5ls",
} satisfies ClerkClaim;

describe("verifyAuth", () => {
  let ctx: ReturnType<typeof createFPApiSQLCtx>;
  beforeAll(async () => {
    const url = inject("DASH_FP_TEST_SQL_URL" as never) as string;
    const client = createClient({ url });
    const db = drizzle(client);
    const sthis = ensureSuperThis();
    const deviceCA = await createTestDeviceCA(sthis);
    ctx = createFPApiSQLCtx(
      sthis,
      db,
      {
        clerk: {
          verify: async (token: string): Promise<Result<VerifiedClaimsResult>> => {
            const claims = await decodeJwt(token); // just to verify structure
            return Result.Ok({
              type: "clerk",
              token: token,
              claims,
            });
          },
        },
      },
      deviceCA,
      {
        maxTenants: 5,
        cloudPublicKeys: [],
        clerkPublishableKey: "",
        maxAdminUsers: 0,
        maxMemberUsers: 0,
        maxInvites: 0,
        maxLedgers: 0,
        maxAppIdBindings: 0,
      },
    );
  });

  it("receives clerk auth", async () => {
    // verify token and extract claims
    const rAuth = await verifyAuth(ctx, { auth: { type: "clerk", token: clerkToken } });
    expect(rAuth.Ok()).toEqual({
      type: "VerifiedAuthResult",
      inDashAuth: { type: "clerk", token: clerkToken },
      verifiedAuth: {
        type: "clerk",
        claims: claims,
      },
    });
  });
});
