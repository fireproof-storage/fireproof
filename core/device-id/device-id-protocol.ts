import { IssueCertificateResult, JWKPrivateSchema, SuperThis } from "@fireproof/core-types-base";
import { DeviceIdCA } from "./device-id-CA.js";
import { param, Result } from "@adviser/cement";
import { DeviceIdKey } from "./device-id-key.js";
import { base58btc } from "multiformats/bases/base58";
import { DeviceIdVerifyMsg } from "./device-id-verify-msg.js";
import { CAActions, DeviceIdProtocol, DeviceIdProtocolSrvOpts, VerifyWithCertificateResult } from "@fireproof/core-types-device-id";

async function ensureCA(sthis: SuperThis, actions: CAActions): Promise<Result<DeviceIdCA>> {
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
      actions,
    }),
  );
}

export class DeviceIdProtocolSrv implements DeviceIdProtocol {
  // readonly #ca: DeviceIdCA;
  readonly #verifyMsg: DeviceIdVerifyMsg;
  static async create(sthis: SuperThis, opts: DeviceIdProtocolSrvOpts): Promise<Result<DeviceIdProtocol>> {
    const rCa = await ensureCA(sthis, opts.actions);
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
    // this.#ca = ca;
    this.#verifyMsg = verifyMsg;
  }

  // issue a certificate
  // @param msg: string // CSR as JWT String
  issueCertificate(_msg: string): Promise<Result<IssueCertificateResult>> {
    throw new Error("Method not implemented.");
    // return this.#ca.processCSR(msg);
  }
  // sign a message
  // @param msg: string // JWT String
  verifyMsg<S>(message: string, schema?: S): Promise<VerifyWithCertificateResult<S>> {
    return this.#verifyMsg.verifyWithCertificate<S>(message, schema);
  }
}
