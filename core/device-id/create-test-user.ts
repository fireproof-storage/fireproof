import { FPDeviceIDSession, SuperThis } from "@fireproof/core-types-base";
import { DashAuthType } from "@fireproof/core-types-protocols-dashboard";
import { DeviceIdCSR } from "./device-id-CSR.js";
import { DeviceIdKey } from "./device-id-key.js";
import { DeviceIdSignMsg } from "./device-id-signed-msg.js";
import { DeviceIdCAIf } from "@fireproof/core-types-device-id";
import { Lazy } from "@adviser/cement";

// const session = sthis.nextId().str;
export interface TestUser {
  readonly session?: string;
  readonly seqUserId?: number;
  readonly sthis: SuperThis;
  readonly deviceCA: DeviceIdCAIf;
}

const sessionId = Lazy((sthis: SuperThis) => sthis.nextId().str);
const seqUserIdGlobal = Lazy((sthis: SuperThis) => ({ id: parseInt(sessionId(sthis).replace(/[^0-9]/g, ""), 10) }));
export async function createTestUser({ sthis, session, seqUserId, deviceCA }: TestUser): Promise<{
  readonly devkey: DeviceIdKey;
  readonly deviceIdSigner: DeviceIdSignMsg;
  readonly getDashBoardToken: () => Promise<DashAuthType>;
}> {
  // console.log("Creating test user", session, seqUserId);
  const devid = await DeviceIdKey.create();
  const devkey = (await DeviceIdKey.createFromJWK(await devid.exportPrivateJWK())).Ok();
  const deviceIdCSR = new DeviceIdCSR(sthis, devkey);
  const rCsrResult = await deviceIdCSR.createCSR({ commonName: "test-device-id" });
  const userId = `${session ?? sessionId(sthis)}-${seqUserId ?? seqUserIdGlobal(sthis).id++}`;
  const rProcessResult = await deviceCA.processCSR(rCsrResult.Ok(), {
    azp: `test-app-${userId}-${sthis.nextId().str}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: "test-issuer",
    jti: sthis.nextId().str,
    nbf: Math.floor(Date.now() / 1000),
    params: {
      nick: `nick-${userId}`,
      email: `email-${userId}@example.com`,
      email_verified: true,
      first: `first-${userId}`,
      image_url: `http://example.com/image-${userId}.png`,
      last: `last-${userId}`,
      name: `name-${userId}`,
      public_meta: `{ "role": "tester-${userId}" }`,
    },

    role: "devide-id",
    sub: `device-id-subject-${sthis.nextId().str}`,
    userId: `user-id-${userId}`,

    aud: ["http://test-audience.localhost/"],
  });
  // console.log("DeviceIdCA-processCSR", rProcessResult.Ok().certificatePayload);
  const deviceIdSigner = new DeviceIdSignMsg(sthis.txt.base64, devkey, rProcessResult.Ok().certificatePayload);

  let seq = 0;
  const getDashBoardToken = async (): Promise<DashAuthType> => {
    const now = Math.floor(Date.now() / 1000);
    const token = await deviceIdSigner.sign(
      {
        iss: "app-id",
        sub: "device-id",
        deviceId: await devkey.fingerPrint(),
        seq: ++seq,
        exp: now + 120,
        nbf: now - 2,
        iat: now,
        jti: sthis.nextId().str,
      } satisfies FPDeviceIDSession,
      "ES256",
    );
    return {
      type: "device-id",
      token,
    };
  };
  return { devkey, deviceIdSigner, getDashBoardToken };
}
