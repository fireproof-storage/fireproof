import { JWKPrivateSchema, SuperThis } from "@fireproof/core-types-base";
import { CAActions, DeviceIdCA, IssueCertificateResult } from "./device-id-CA.js";
import { param } from "@adviser/cement";
import { DeviceIdKey } from "./device-id-key.js";
import { base58btc } from "multiformats/bases/base58";
import { DeviceIdVerifyMsg, VerifyWithCertificateResult } from "./device-id-verify-msg.js";

async function ensureCA(sthis: SuperThis, actions: CAActions) {
  const rEnv = sthis.env.gets({
    DEVICE_ID_CA_KEY: param.REQUIRED,
    DEVICE_ID_CA_COMMON_NAME: param.OPTIONAL,
  });
  if (rEnv.isErr()) {
    throw rEnv.Err();
  }
  const env = rEnv.Ok();
  const { success, data: caKey } = JWKPrivateSchema.safeParse(JSON.parse(sthis.txt.decode(base58btc.decode(env.DEVICE_ID_CA_KEY))));
  if (!success || !caKey) {
    throw new Error("Invalid CA key");
  }

  return new DeviceIdCA({
    base64: sthis.txt.base64,
    caKey: await DeviceIdKey.createFromJWK(caKey),
    caSubject: {
      commonName: env.DEVICE_ID_CA_COMMON_NAME ?? "Fireproof CA",
    },
    actions,
  });
}

export interface DeviceIdProtocol {
  issueCertificate(msg: string): Promise<IssueCertificateResult>;
  verifyMsg(message: string): Promise<VerifyWithCertificateResult>;
}

export interface DeviceIdProtocolSrvOpts {
  readonly actions: CAActions;
}

export class DeviceIdProtocolSrv implements DeviceIdProtocol {
  readonly #ca: DeviceIdCA;
  readonly #verifyMsg: DeviceIdVerifyMsg;
  static async create(sthis: SuperThis, opts: DeviceIdProtocolSrvOpts): Promise<DeviceIdProtocol> {
    const ca = await ensureCA(sthis, opts.actions);
    const verifyMsg = new DeviceIdVerifyMsg(sthis.txt.base64, [await ca.caCertificate()], {
      clockTolerance: 60,
      maxAge: 3600,
    });
    return new DeviceIdProtocolSrv(ca, verifyMsg);
  }

  private constructor(ca: DeviceIdCA, verifyMsg: DeviceIdVerifyMsg) {
    this.#ca = ca;
    this.#verifyMsg = verifyMsg;
  }

  // issue a certificate
  // @param msg: string // CSR as JWT String
  issueCertificate(msg: string): Promise<IssueCertificateResult> {
    return this.#ca.processCSR(msg);
  }
  // sign a message
  // @param msg: string // JWT String
  verifyMsg(message: string): Promise<VerifyWithCertificateResult> {
    return this.#verifyMsg.verifyWithCertificate(message);
  }
}
