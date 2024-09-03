import { MockLogger, runtimeFn, toCryptoRuntime, URI } from "@adviser/cement";
import { dataDir, ensureSuperThis, rt, SuperThis, SuperThisOpts } from "@fireproof/core";

export { dataDir };

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function toFileWithCid(buffer: Uint8Array, name: string, opts: FilePropertyBag): Promise<FileWithCid> {
  return {
    file: new File([new Blob([buffer])], name, opts),
    cid: (await rt.files.encodeFile(new File([new Blob([buffer])], name, opts))).cid.toString(),
  };
}

export interface FileWithCid {
  file: File;
  cid: string;
}
export async function buildBlobFiles(): Promise<FileWithCid[]> {
  const cp = toCryptoRuntime();
  return [
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `image.jpg`, { type: "image/jpeg" }),
    await toFileWithCid(cp.randomBytes(Math.random() * 51283), `fireproof.png`, { type: "image/png" }),
  ];
}

export function storageURL(sthis: SuperThis): URI {
  const old = sthis.env.get("FP_STORAGE_URL");
  let merged: URI;
  if (runtimeFn().isBrowser) {
    merged = URI.merge(`indexdb://fp`, old, "indexdb:");
  } else {
    merged = URI.merge(`./dist/env`, old);
  }
  return merged;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function mockSuperThis(sthis?: Partial<SuperThisOpts>): SuperThis {
  const mockLog = MockLogger();
  return ensureSuperThis({
    logger: mockLog.logger,
    ctx: {
      logCollector: mockLog.logCollector,
    },
  });
}
