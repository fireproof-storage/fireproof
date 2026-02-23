import { BuildURI, exception2Result, KeyedResolvOnce, Result, URI } from "@adviser/cement";
import { sha256 } from "@noble/hashes/sha2";
import { CID } from "multiformats";
import { create as createDigest } from "multiformats/hashes/digest";
import * as raw from "multiformats/codecs/raw";
import { DexieStorageBackend } from "./dexie.js";
import type { CIDGetResult, CIDStoreResult, StorageBackend } from "./types.js";

const SHA2_256 = 0x12;

function hashingTap() {
  const h = sha256.create();
  let size = 0;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      h.update(chunk);
      size += chunk.byteLength;
      ctrl.enqueue(chunk);
    },
  });
  const getCID = () => {
    const digest = createDigest(SHA2_256, h.digest());
    return { cid: CID.create(1, raw.code, digest).toString(), size };
  };
  return { transform, getCID };
}

const cidStorageServicePerBackend = new KeyedResolvOnce<CIDStorageServiceImpl>();

export function CIDStorageService(x?: { backends?: StorageBackend[] }) {
  const bs = x?.backends ?? [DexieStorageBackend()];
  return cidStorageServicePerBackend
    .get(
      bs
        .map((b) => b.name)
        .sort()
        .join(","),
    )
    .once(() => new CIDStorageServiceImpl(bs));
}

export class CIDStorageServiceImpl {
  readonly backends: StorageBackend[];

  constructor(backends: StorageBackend[]) {
    this.backends = backends;
  }

  // single backend — extend to fanOut when multi-backend support is needed
  private get backend(): StorageBackend {
    return this.backends[0];
  }

  async store(stream: ReadableStream<Uint8Array>): Promise<Result<CIDStoreResult>> {
    return exception2Result(async (): Promise<Result<CIDStoreResult>> => {
      const { transform, getCID } = hashingTap();
      const write = await this.backend.store(stream.pipeThrough(transform));
      if (write.isErr()) return Result.Err(write);

      const { cid, size } = getCID();

      const commit = await write.Ok().commit(cid);
      if (commit.isErr()) return Result.Err(commit);

      const url = BuildURI.from(`${this.backend.name}://`).setParam("cid", cid).toString();

      return Result.Ok({ cid, size, created: new Date(), url });
    });
  }

  async get(url: string): Promise<Result<CIDGetResult>> {
    const cid = URI.from(url).getParam("cid");
    if (!cid) return Result.Err("missing cid in url");
    const result = await this.backend.get(cid);
    if (result.isErr()) return Result.Err(result.Err());
    const found = result.Ok();
    if (found) return Result.Ok({ found: true, cid, size: found.size, stream: found.stream });
    return Result.Ok({ found: false, cid });
  }
}
