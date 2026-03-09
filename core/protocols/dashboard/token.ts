import { Lazy, Result, param, exception2Result } from "@adviser/cement";
import { DeviceIdCA, DeviceIdVerifyMsg } from "@fireproof/core-device-id";
import { sts } from "@fireproof/core-runtime";
import { SuperThis, FPClerkClaim, FPClerkClaimSchema, FPDeviceIDSessionSchema, ClerkClaimSchema } from "@fireproof/core-types-base";
import { FPApiToken, VerifiedClaimsResult, ClerkVerifiedAuth } from "@fireproof/core-types-protocols-dashboard";
import { VerifyWithCertificateOptions } from "@fireproof/core-types-device-id";
import { decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";

export class ClerkApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }

  readonly keysAndUrls = Lazy((): Result<{ keys: string[]; urls: string[] }> => {
    const keys: string[] = [];
    const urls: string[] = [];
    // eslint-disable-next-line no-constant-condition
    for (let idx = 0; true; idx++) {
      const suffix = !idx ? "" : `_${idx}`;
      const key = `CLERK_PUB_JWT_KEY${suffix}`;
      const url = `CLERK_PUB_JWT_URL${suffix}`;
      const rEnvVal = this.sthis.env.gets({
        [key]: param.OPTIONAL,
        [url]: param.OPTIONAL,
      });
      if (rEnvVal.isErr()) {
        return Result.Err(rEnvVal.Err());
      }
      const { [key]: keyVal, [url]: urlVal } = rEnvVal.Ok();
      if (!keyVal && !urlVal) {
        // end loop of CLERK_PUB_JWT_KEYn and CLERK_PUB_JWT_URLn
        break;
      }
      if (keyVal) {
        keys.push(keyVal);
      }
      if (urlVal) {
        urls.push(
          ...urlVal
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u),
        );
      }
    }
    return Result.Ok({ keys, urls });
  });

  async decode(token: string): Promise<Result<VerifiedClaimsResult>> {
    const claims = await exception2Result(() => decodeJwt(token)); // just to verify structure
    if (claims.isErr()) {
      return Result.Err(claims);
    }
    const r = ClerkClaimSchema.safeParse(claims.Ok());
    if (!r.success) {
      return Result.Err(r.error);
    }
    return Result.Ok({
      type: "clerk",
      token,
      claims: r.data,
    });
  }

  async verify(token: string): Promise<Result<VerifiedClaimsResult>> {
    const rKaUs = this.keysAndUrls();
    if (rKaUs.isErr()) {
      return Result.Err(rKaUs);
    }
    const { keys, urls } = rKaUs.Ok();

    const rt = await sts.verifyToken(token, keys, urls, {
      parseSchema: (payload: unknown): Result<FPClerkClaim> => {
        const r = FPClerkClaimSchema.safeParse(payload);
        if (r.success) {
          return Result.Ok(r.data);
        } else {
          // eslint-disable-next-line no-console
          console.log("FPClerkClaimSchema parse error", payload, r.error);
          return Result.Err(r.error);
        }
      },
      verifyToken: async (token, key) => {
        const rPublicKey = await sts.importJWK(key, "RS256");
        if (rPublicKey.isErr()) {
          return Result.Err(rPublicKey);
        }
        // const pem = await exportSPKI(rPublicKey.Ok().key);
        // console.log("ClerkApiToken-verify", pem);

        const r = await exception2Result(
          () => jwtVerify(token, rPublicKey.Ok().key),
          // ClerkVerifyToken(token, {
          //   jwtKey: pem,
          //   // authorizedParties: ["http://localhost:7370"],
          // }),
        );
        // console.log("ClerkApiToken-verify-jwtVerify", r);
        if (r.isErr()) {
          return Result.Err(r);
        }
        if (!r.Ok()) {
          return Result.Err("ClerkVerifyToken: failed");
        }
        return Result.Ok({
          payload: r.Ok(),
        });
      },
    });
    if (rt.isErr()) {
      return Result.Err(rt.Err());
    }
    const t = rt.Ok();
    return Result.Ok({
      type: "clerk",
      token,
      claims: t.payload,
    });
  }
}

export class DeviceIdApiToken implements FPApiToken {
  readonly sthis: SuperThis;
  readonly opts: VerifyWithCertificateOptions;
  constructor(sthis: SuperThis, opts: VerifyWithCertificateOptions) {
    this.sthis = sthis;
    this.opts = opts;
  }

  async decode(token: string): Promise<Result<VerifiedClaimsResult>> {
    const rHeader = await exception2Result(() => decodeProtectedHeader(token));
    if (rHeader.isErr()) {
      return Result.Err(rHeader);
    }
    if (!rHeader.Ok().x5c || !rHeader.Ok().x5c?.[0]) {
      return Result.Err("DeviceIdApiToken-decode: missing x5c in header");
    }
    const jsStr = this.sthis.txt.base64.decode(rHeader.Ok().x5c?.[0] ?? ""); // just to verify it's valid base64
    const rJs = await exception2Result(() => JSON.parse(jsStr));
    if (rJs.isErr()) {
      return Result.Err(rJs);
    }
    const rClaims = ClerkClaimSchema.safeParse(rJs.Ok().creatingUser?.claims);
    if (!rClaims.success) {
      return Result.Err(rClaims.error);
    }
    return Result.Ok({
      type: "device-id",
      token,
      claims: rClaims.data,
    });
  }

  async verify(token: string): Promise<Result<VerifiedClaimsResult>> {
    const rCa = await this.opts.deviceIdCA.caCertificate();
    if (rCa.isErr()) {
      return Result.Err(rCa);
    }
    const verify = new DeviceIdVerifyMsg(this.sthis.txt.base64, [rCa.Ok()], {
      maxAge: 3600,
      ...this.opts,
    });
    const res = await verify.verifyWithCertificate(token, FPDeviceIDSessionSchema);
    if (res.valid) {
      const creatingUser = (res.certificate.certificate.asCert() as { creatingUser: ClerkVerifiedAuth }).creatingUser;
      // console.log("DeviceIdApiToken-verify", Object.keys(res.certificate.certificate.asCert()))
      // console.log("DeviceIdApiToken-verify", creatingUser);
      if (!creatingUser || creatingUser.type !== "clerk") {
        return Result.Err(`DeviceIdApiToken-verify: unsupported creatingUser type: ${creatingUser}`);
      }
      // console.log("DeviceIdApiToken-verify-1", JSON.stringify(creatingUser.claims));
      return Result.Ok({
        type: "device-id",
        token,
        claims: creatingUser.claims,
      });
    }
    return Result.Err(res.error);
  }
}

export const deviceIdCAFromEnv = Lazy((sthis: SuperThis) => {
  const rEnv = sthis.env.gets({
    DEVICE_ID_CA_PRIV_KEY: param.REQUIRED,
    DEVICE_ID_CA_CERT: param.REQUIRED,
  });
  if (rEnv.isErr()) {
    throw rEnv.Err();
  }
  // console.log("rDeviceIdCA Env:", stripper(/^(?!DEVICE_ID)/, rEnv.Ok()));
  const envVals = rEnv.Ok();
  return DeviceIdCA.from(
    sthis,
    {
      privateKey: envVals.DEVICE_ID_CA_PRIV_KEY,
      signedCert: envVals.DEVICE_ID_CA_CERT,
    },
    {
      generateSerialNumber: async () => sthis.nextId(32).str,
    },
  );
});

export class ServiceApiToken implements FPApiToken {
  readonly sthis: SuperThis;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }

  async decode(token: string): Promise<Result<VerifiedClaimsResult>> {
    return this.verify(token);
  }

  async verify(token: string): Promise<Result<VerifiedClaimsResult>> {
    const rEnv = this.sthis.env.gets({
      SERVICE_API_KEY: param.OPTIONAL,
    });
    if (rEnv.isErr()) {
      return Result.Err("Service auth configuration error");
    }
    const configuredKey = rEnv.Ok().SERVICE_API_KEY;
    if (!configuredKey) {
      return Result.Err("Service auth not configured");
    }

    // Compound token format: <key>|<userId>|<email>
    const parts = token.split("|");
    if (parts.length < 3) {
      return Result.Err("Invalid service token format");
    }
    const [key, userId, email] = parts;

    if (key !== configuredKey) {
      return Result.Err("Invalid service key");
    }

    return Result.Ok({
      type: "service",
      token,
      claims: {
        userId,
        sub: userId,
        role: "admin",
        params: {
          email: email,
          email_verified: true,
          first: "Service",
          last: "Account",
          image_url: "",
          name: "Service Account",
          public_meta: {},
        },
      },
    });
  }
}

export const tokenApi = Lazy(async (sthis: SuperThis, opts: VerifyWithCertificateOptions) => {
  // const rDeviceIdCA = await DeviceIdCA.from(sthis, {
  //   privateKeyEnv: "DEVICE_ID_CA_PRIV_KEY",
  //   signedCertEnv: "DEVICE_ID_CA_CERT",
  // }, {
  //   generateSerialNumber: async () => sthis.nextId(32).str,
  // });
  return {
    "device-id": new DeviceIdApiToken(sthis, opts),
    clerk: new ClerkApiToken(sthis),
    service: new ServiceApiToken(sthis),
  };
});
