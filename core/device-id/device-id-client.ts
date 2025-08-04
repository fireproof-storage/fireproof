// can create a CSR
// can sign Msg

import { IssueCertificateResult, SuperThis } from "@fireproof/core-types-base";
import { getKeyBag } from "@fireproof/core-keybag";
import { ResolveOnce, Result } from "@adviser/cement";
import { DeviceIdKey } from "./device-id-key.js";
import { DeviceIdSignMsg } from "./device-id-signed-msg.js";
import { DeviceIdCSR } from "./device-id-CSR.js";
import { DeviceIdProtocol } from "./device-id-protocol.js";

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

export interface DeviceIdTransport {
  issueCertificate(csrJWT: string): Promise<Result<IssueCertificateResult>>;
}

export class DeviceIdClient {
  readonly #sthis: SuperThis;
  readonly #transport: DeviceIdProtocol;

  constructor(sthis: SuperThis, transport: DeviceIdProtocol) {
    this.#sthis = sthis;
    this.#transport = transport;
  }

  ensureDeviceId() {
    return onceDeviceId.once(async (): Promise<Result<MsgSigner>> => {
      const kBag = await getKeyBag(this.#sthis);
      let deviceIdResult = await kBag.getDeviceId();
      if (deviceIdResult.deviceId.IsNone()) {
        const key = await DeviceIdKey.create();
        deviceIdResult = await kBag.setDeviceId(await key.exportPrivateJWK());
      }
      const key = await DeviceIdKey.createFromJWK(deviceIdResult.deviceId.unwrap());
      if (deviceIdResult.cert.IsNone()) {
        const csr = new DeviceIdCSR(this.#sthis, key);
        const rCsrJWT = await csr.createCSR({ commonName: `fp-dev@${await key.fingerPrint()}` });
        if (rCsrJWT.isErr()) {
          return Result.Err(rCsrJWT.Err());
        }
        const rCertResult = await this.#transport.issueCertificate(rCsrJWT.Ok());
        if (rCertResult.isErr()) {
          return Result.Err(rCertResult.Err());
        }
        deviceIdResult = await kBag.setDeviceId(deviceIdResult.deviceId.Unwrap(), rCertResult.Ok());
      }
      const cert = deviceIdResult.cert.unwrap();
      if (!cert) {
        return Result.Err(`No certificate for ${deviceIdResult.deviceId.unwrap().kid}`);
      }
      return Result.Ok(new MsgSigner(new DeviceIdSignMsg(this.#sthis.txt.base64, key, cert.certificatePayload)));
    });
  }

  // sign a message
  // @param msg: string // JWT String
  sendSigned<T extends NonNullable<unknown>>(_payload: T, _algorithm?: string): Promise<string> {
    throw new Error("sendSigned not implemented");
  }
}
