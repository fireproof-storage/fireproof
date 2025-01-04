import { BuildURI, MockLogger, runtimeFn, toCryptoRuntime, URI, utils, LogCollector } from "@adviser/cement";
import { ensureSuperThis, rt, SuperThis, SuperThisOpts, bs, PARAM } from "@fireproof/core";

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

export type MockSuperThis = SuperThis & { ctx: { logCollector: LogCollector } };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function mockSuperThis(sthis?: Partial<SuperThisOpts>): MockSuperThis {
  const mockLog = MockLogger({
    pass: new utils.ConsoleWriterStreamDefaultWriter(new utils.ConsoleWriterStream()),
  });
  return ensureSuperThis({
    logger: mockLog.logger,
    ctx: {
      logCollector: mockLog.logCollector,
    },
  }) as MockSuperThis;
}

export function noopUrl(name?: string): URI {
  const burl = BuildURI.from("memory://noop");
  burl.setParam(PARAM.NAME, name || "test");
  return burl.URI();
}

export function simpleBlockOpts(sthis: SuperThis, name?: string) {
  const url = noopUrl(name);
  return {
    keyBag: rt.kb.defaultKeyBagOpts(sthis),
    storeRuntime: bs.toStoreRuntime(sthis),
    storeUrls: {
      file: url,
      wal: url,
      meta: url,
      data: url,
    },
  };
}
