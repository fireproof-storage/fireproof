import { IssueCertificateResult, JWKPrivateSchema, SuperThis, JWKPublic } from "@fireproof/core-types-base";
import { CAActions, DeviceIdCA } from "./device-id-CA.js";
import { param, Result } from "@adviser/cement";
import { DeviceIdKey } from "./device-id-key.js";
import { base58btc } from "multiformats/bases/base58";
import { DeviceIdVerifyMsg, VerifyWithCertificateResult } from "./device-id-verify-msg.js";

// Stub implementation until real CAActions is integrated
const stubCAActions: CAActions = {
  generateSerialNumber: async (_pub: JWKPublic) => {
    // TODO: Implement proper serial number generation based on public key
    // This should generate a unique, deterministic serial number for the certificate
    return `stub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },
};

async function ensureCA(sthis: SuperThis, opts: DeviceIdProtocolSrvOpts): Promise<Result<DeviceIdCA>> {
  const rEnv = sthis.env.gets({
    DEVICE_ID_CA_KEY: opts.env?.DEVICE_ID_CA_KEY ?? param.REQUIRED,
    DEVICE_ID_CA_COMMON_NAME: opts.env?.DEVICE_ID_CA_COMMON_NAME ?? param.OPTIONAL,
  });
  if (rEnv.isErr()) {
    throw rEnv.Err();
  }
  const env = rEnv.Ok();
  const { success, data: caKey } = JWKPrivateSchema.safeParse(JSON.parse(sthis.txt.decode(base58btc.decode(env.DEVICE_ID_CA_KEY))));
  if (!success || !caKey) {
    return Result.Err("Invalid CA key");
  }
  const rCaKey = await DeviceIdKey.createFromJWK(caKey);
  if (rCaKey.isErr()) {
    return Result.Err(rCaKey);
  }
  return Result.Ok(
    new DeviceIdCA({
      base64: sthis.txt.base64,
      caKey: rCaKey.Ok(),
      caSubject: {
        commonName: env.DEVICE_ID_CA_COMMON_NAME ?? "Fireproof CA",
      },
      actions: stubCAActions,
    }),
  );
}

export interface DeviceIdProtocol {
  issueCertificate(msg: string): Promise<Result<IssueCertificateResult>>;
  verifyMsg(message: string): Promise<VerifyWithCertificateResult>;
}

export interface DeviceIdProtocolSrvOpts {
  // usally from ENV
  readonly env?: {
    readonly DEVICE_ID_CA_KEY: string;
    readonly DEVICE_ID_CA_COMMON_NAME?: string;
  };
  // Note: Uses stubCAActions until proper CAActions implementation is provided
}

export class DeviceIdProtocolSrv implements DeviceIdProtocol {
  readonly #ca: DeviceIdCA;
  readonly #verifyMsg: DeviceIdVerifyMsg;
  static async create(sthis: SuperThis, opts: DeviceIdProtocolSrvOpts): Promise<Result<DeviceIdProtocol>> {
    const rCa = await ensureCA(sthis, opts);
    if (rCa.isErr()) {
      return Result.Err(rCa);
    }
    const rCaCert = await rCa.Ok().caCertificate();
    if (rCaCert.isErr()) {
      return Result.Err(rCaCert);
    }
    const verifyMsg = new DeviceIdVerifyMsg(sthis.txt.base64, [rCaCert.Ok()], {
      clockTolerance: 60,
      maxAge: 3600,
    });
    return Result.Ok(new DeviceIdProtocolSrv(rCa.Ok(), verifyMsg));
  }

  private constructor(ca: DeviceIdCA, verifyMsg: DeviceIdVerifyMsg) {
    this.#ca = ca;
    this.#verifyMsg = verifyMsg;
  }

  // issue a certificate
  // @param msg: string // CSR as JWT String
  issueCertificate(msg: string): Promise<Result<IssueCertificateResult>> {
    return this.#ca.processCSR(msg);
  }
  // sign a message
  // @param msg: string // JWT String
  verifyMsg(message: string): Promise<VerifyWithCertificateResult> {
    return this.#verifyMsg.verifyWithCertificate(message);
  }
}
