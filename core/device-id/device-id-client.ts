// can create a CSR
// can sign Msg

import { SuperThis } from "@fireproof/core-types-base";
import { getKeyBag } from "@fireproof/core-keybag";
import { ResolveOnce } from "@adviser/cement";
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

const onceDeviceId = new ResolveOnce<MsgSigner>();

export interface DeviceIdApi extends DeviceIdProtocol {
 // sign a message
  // @param msg: string // JWT String
  sign<T extends NonNullable<unknown>>(payload: T, algorithm?: string): Promise<string>;
}

export async function ensureDeviceId(sthis: SuperThis) {
  return onceDeviceId.once(async () => {
    const kBag = await getKeyBag(sthis);
    let deviceIdResult = await kBag.getDeviceId();
    if (deviceIdResult.deviceId.IsNone()) {
      const key = await DeviceIdKey.create();
      deviceIdResult = await kBag.setDeviceId(await key.exportPrivateJWK());
    }
    const key = await DeviceIdKey.createFromJWK(deviceIdResult.deviceId.unwrap());

    if (deviceIdResult.cert.IsNone()) {
      const csr = new DeviceIdCSR(key);
      const csrJWT = await csr.createCSR({ commonName: `fp-dev@${await key.fingerPrint()}` });

      // todo create cert
    }

    // if cert is not there create one or cert is to be renewed
    // create csr
    // request signing -> get cert
    // put into keybag

    return new MsgSigner(new DeviceIdSignMsg(sthis.txt.base64, key, cert));
  });
}
