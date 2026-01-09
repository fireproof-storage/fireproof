import { DeviceIdCA, DeviceIdKey } from "@fireproof/core-device-id";
import { SuperThis, Subject } from "@fireproof/core-types-base";

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
