import { fireproof, FPDeviceIDSession } from "@fireproof/core";
import { FPCloudClaimParseSchema, TokenAndClaims, TokenStrategie } from "@fireproof/core-types-protocols-cloud";
// import { toCloud } from "use-fireproof";
import { decodeJwt } from "jose";
import { Lazy, Result } from "@adviser/cement";
import { hashObjectSync } from "@fireproof/core-runtime";
import { getKeyBag } from "@fireproof/core-keybag";
import { DeviceIdKey, DeviceIdSignMsg } from "@fireproof/core-device-id";
import { DashAuthType, DashboardApiImpl } from "@fireproof/core-protocols-dashboard";

export class CliTokenStrategy implements TokenStrategie {
  readonly tc: TokenAndClaims;

  static async fromJWK(jwk: string): Promise<Result<CliTokenStrategy>> {
    const rawClaims = decodeJwt(jwk);
    const rParse = FPCloudClaimParseSchema.safeParse(rawClaims);
    if (rParse.success) {
      return Result.Ok(
        new CliTokenStrategy({
          token: jwk,
          claims: rParse.data,
        }),
      );
    } else {
      return Result.Err(rParse.error);
    }
  }

  constructor(tc: TokenAndClaims) {
    this.tc = tc;
  }

  readonly hash = Lazy(() => hashObjectSync(this.tc.token));

  stop(): void {
    // console.log("SimpleTokenStrategy stop");
    return;
  }

  open(): void {
    // console.log("SimpleTokenStrategy open");
    return;
  }
  async tryToken(): Promise<TokenAndClaims | undefined> {
    // console.log("SimpleTokenStrategy gatherToken");
    return this.tc;
  }
  async waitForToken(): Promise<TokenAndClaims | undefined> {
    // console.log("SimpleTokenStrategy waitForToken");
    return this.tc;
  }
}

async function main() {
  const db = fireproof(`hello:world`, {
    storeUrls: {
      base: "memory://connect/once",
    },
  });
  const kb = await getKeyBag(db.ledger.sthis);
  const devid = await kb.getDeviceId();
  const rDevkey = await DeviceIdKey.createFromJWK(devid.deviceId.Unwrap());
  if (rDevkey.isErr()) {
    throw rDevkey.Err();
  }
  if (devid.cert.IsNone()) {
    throw new Error("Device ID certificate is missing");
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const payload = devid.cert.Unwrap()!.certificatePayload;

  const deviceIdSigner = new DeviceIdSignMsg(db.ledger.sthis.txt.base64, rDevkey.Ok(), payload);

  let seq = 0;
  const getDashBoardToken = Lazy(
    async (): Promise<DashAuthType> => {
      const now = Math.floor(Date.now() / 1000);
      const token = await deviceIdSigner.sign(
        {
          iss: "app-id",
          sub: "device-id",
          deviceId: await rDevkey.Ok().fingerPrint(),
          seq: ++seq,
          exp: now + 120,
          nbf: now - 2,
          iat: now,
          jti: db.ledger.sthis.nextId().str,
        } satisfies FPDeviceIDSession,
        "ES256",
      );
      return {
        type: "device-id",
        token,
      };
    },
    { resetAfter: 60 },
  );
  const dashApi = new DashboardApiImpl({
    gracePeriodMs: 5000,
    getTokenCtx: {
      template: "with-email",
    },
    apiUrl: "http://localhost:7370/api",
    fetch: fetch.bind(globalThis),
    getToken: async () => {
      return Result.Ok(await getDashBoardToken());
    },
  });

  const user = await dashApi.ensureUser({});
  console.log("CLI FP User:", user);

  // const res = await db.attach(
  //   toCloud({
  //     urls: { base: "https://gateway.fireproof.app/cloud/your-cloud-id" },
  //     strategy: new CliTokenStrategy(db.ledger.
  //   }),
  // );
  // console.log("cloud attach result:", res);
  // const puts = await db.put({ hello: "world" });
  // console.log("gets", puts);
  // const gets = await db.get(puts.id);
  // console.log("gets", gets, puts);
}

main().catch((err) => {
  console.error("Error in CLI FP:", err);
  process.exit(1);
});
