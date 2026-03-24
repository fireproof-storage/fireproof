// can create a CSR
// can sign Msg

import { IssueCertificateResult, SuperThis } from "@fireproof/core-types-base";
import { getKeyBag } from "@fireproof/core-keybag";
import { ResolveOnce, Result } from "@adviser/cement";
import { DeviceIdKey } from "./device-id-key.js";
import { DeviceIdSignMsg } from "./device-id-signed-msg.js";
import { DeviceIdCSR } from "./device-id-CSR.js";
import { DeviceIdProtocol, VerifyWithCertificateResult } from "@fireproof/core-types-device-id";

class NoopProtocol implements DeviceIdProtocol {
  issueCertificate(_msg: string): Promise<Result<IssueCertificateResult>> {
    return Promise.resolve(Result.Err("NoopProtocol: issueCertificate not supported"));
  }
  verifyMsg<S>(_message: string, _schema?: S): Promise<VerifyWithCertificateResult<S>> {
    return Promise.resolve({
      valid: false,
      error: new Error("NoopProtocol: verifyMsg not supported"),
      errorCode: "NOOP",
      partialResults: { certificateExtracted: false, jwtSignatureValid: false },
      verificationTimestamp: new Date().toISOString(),
    });
  }
}

class MsgSigner {
  #x: DeviceIdSignMsg;

  constructor(x: DeviceIdSignMsg) {
    this.#x = x;
  }

  sign<T extends NonNullable<unknown>>(payload: T, algorithm?: string): Promise<string> {
    return this.#x.sign(payload, algorithm);
  }
}

const onceDeviceId = new ResolveOnce<Result<MsgSigner>>();
const onceDeviceIdWithoutCert = new ResolveOnce<Result<DeviceIdKey>>();

export class DeviceIdClient {
  readonly #sthis: SuperThis;
  readonly #transport: DeviceIdProtocol;

  constructor(sthis: SuperThis, transport: DeviceIdProtocol = new NoopProtocol()) {
    this.#sthis = sthis;
    this.#transport = transport;
  }

  ensureDeviceIdWithoutCert(): Promise<Result<DeviceIdKey>> {
    return onceDeviceIdWithoutCert.once(async (): Promise<Result<DeviceIdKey>> => {
      const kBag = await getKeyBag(this.#sthis);
      let deviceIdResult = await kBag.getDeviceId();
      if (deviceIdResult.deviceId.IsNone()) {
        const newKey = await DeviceIdKey.create();
        deviceIdResult = await kBag.setDeviceId(await newKey.exportPrivateJWK());
      }
      return DeviceIdKey.createFromJWK(deviceIdResult.deviceId.unwrap());
    });
  }

  ensureDeviceId() {
    return onceDeviceId.once(async (): Promise<Result<MsgSigner>> => {
      const rKey = await this.ensureDeviceIdWithoutCert();
      if (rKey.isErr()) return Result.Err(rKey);
      const key = rKey.Ok();

      const kBag = await getKeyBag(this.#sthis);
      let deviceIdResult = await kBag.getDeviceId();
      if (deviceIdResult.cert.IsNone()) {
        const csr = new DeviceIdCSR(this.#sthis, key);
        const rCsrJWT = await csr.createCSR({ commonName: `fp-dev@${await key.fingerPrint()}` });
        if (rCsrJWT.isErr()) return Result.Err(rCsrJWT.Err());
        const rCertResult = await this.#transport.issueCertificate(rCsrJWT.Ok());
        if (rCertResult.isErr()) return Result.Err(rCertResult.Err());
        deviceIdResult = await kBag.setDeviceId(deviceIdResult.deviceId.Unwrap(), rCertResult.Ok());
      }
      const cert = deviceIdResult.cert.unwrap();
      if (!cert) return Result.Err(`No certificate for ${deviceIdResult.deviceId.unwrap().kid}`);
      return Result.Ok(new MsgSigner(new DeviceIdSignMsg(this.#sthis.txt.base64, key, cert.certificatePayload)));
    });
  }

  // sign a message
  // @param msg: string // JWT String
  sendSigned<T extends NonNullable<unknown>>(_payload: T, _algorithm?: string): Promise<string> {
    throw new Error("sendSigned not implemented");
  }
}
