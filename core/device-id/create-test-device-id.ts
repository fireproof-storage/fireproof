import { SuperThis, Subject } from "@fireproof/core-types-base";
import { DeviceIdCA } from "./device-id-CA.js";
import { DeviceIdKey } from "./device-id-key.js";

export async function createTestDeviceCA(sthis: SuperThis): Promise<DeviceIdCA> {
  const caKey = await DeviceIdKey.create();
  const caSubject: Subject = {
    commonName: "Test Device CA",
    organization: "Test Organization",
    locality: "Test City",
    stateOrProvinceName: "Test State",
    countryName: "US",
  };

  return new DeviceIdCA({
    base64: sthis.txt.base64,
    caKey,
    caSubject,
    actions: {
      generateSerialNumber: async () => sthis.nextId(32).str,
    },
  });
}
