import { Logger, Result, URI } from "@adviser/cement";

import { base58btc } from "multiformats/bases/base58";
import { encode, decode } from "cborg";
import { Gateway, GetResult, UnsubscribeResult, VoidResult } from "./gateway.js";
import { SuperThis } from "../types.js";
import { ensureSuperLog } from "../utils.js";

function getFragSize(url: URI): number {
  const fragSize = url.getParam("fragSize");
  let ret = 0;
  if (fragSize) {
    ret = parseInt(fragSize);
  }
  if (isNaN(ret) || ret <= 0) {
    ret = 0;
  }
  return ret;
}

async function getFrags(url: URI, innerGW: Gateway, headerSize: number, logger: Logger): Promise<Result<Fragment>[]> {
  const fragSize = getFragSize(url);
  if (!fragSize) {
    const res = await innerGW.get(url);
    if (res.isErr()) {
      return [res as unknown as Result<Fragment>];
    }
    const data = res.unwrap();
    return [
      Result.Ok({
        fid: new Uint8Array(0),
        ofs: 0,
        len: data.length,
        data,
      }),
    ];
  }
  const firstRaw = await innerGW.get(url.build().setParam("ofs", "0").URI());
  if (firstRaw.isErr()) {
    return [firstRaw as unknown as Result<Fragment>];
  }
  const firstFragment = decode(firstRaw.unwrap()) as Fragment;
  const blockSize = firstFragment.data.length;
  const ops: Promise<Result<Fragment>>[] = [Promise.resolve(Result.Ok(firstFragment))];
  const fidStr = base58btc.encode(firstFragment.fid);
  const fragUrl = url
    .build()
    .setParam("fid", fidStr)
    .setParam("len", firstFragment.len.toString())
    .setParam("headerSize", headerSize.toString());

  for (let ofs = blockSize; ofs < firstFragment.len; ofs += blockSize) {
    ops.push(
      (async (furl, ofs): Promise<Result<Fragment>> => {
        const raw = await innerGW.get(furl);
        if (raw.isErr()) {
          return raw as unknown as Result<Fragment>;
        }
        const fragment = decode(raw.unwrap());
        if (base58btc.encode(fragment.fid) !== fidStr) {
          return Result.Err(logger.Error().Msg("Fragment fid mismatch").AsError());
        }
        if (fragment.ofs !== ofs) {
          return Result.Err(logger.Error().Uint64("ofs", ofs).Msg("Fragment ofs mismatch").AsError());
        }
        return Result.Ok(fragment);
      })(fragUrl.setParam("ofs", ofs.toString()).URI(), ofs),
    );
  }
  return Promise.all(ops);
}

interface Fragment {
  readonly fid: Uint8Array;
  readonly ofs: number;
  readonly len: number;
  readonly data: Uint8Array;
}

export class FragmentGateway implements Gateway {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fidLength = 4;

  readonly innerGW: Gateway;
  headerSize = 32;

  constructor(sthis: SuperThis, innerGW: Gateway) {
    this.sthis = ensureSuperLog(sthis, "FragmentGateway");
    this.logger = this.sthis.logger;
    this.innerGW = innerGW;
  }

  slicer(url: URI, body: Uint8Array): Promise<VoidResult>[] {
    const fragSize = getFragSize(url);
    if (!fragSize) {
      return [this.innerGW.put(url, body)];
    }
    const blocksize = fragSize - this.headerSize;
    if (blocksize <= 0) {
      throw this.logger
        .Error()
        .Uint64("fragSize", fragSize)
        .Uint64("headerSize", this.headerSize)
        .Msg("Fragment size is too small")
        .AsError();
    }
    const ops: Promise<VoidResult>[] = [];
    const fid = this.sthis.nextId(this.fidLength);
    const fragUrl = url
      .build()
      .setParam("fid", fid.str)
      .setParam("len", body.length.toString())
      .setParam("headerSize", this.headerSize.toString());
    for (let ofs = 0; ofs < body.length; ofs += blocksize) {
      const block = encode({
        fid: fid.bin,
        ofs,
        len: body.length,
        data: body.slice(ofs, ofs + blocksize),
      } as Fragment);
      if (block.length > fragSize) {
        throw this.logger.Error().Uint64("block", block.length).Uint64("fragSize", fragSize).Msg("Block size to big").AsError();
      }
      ops.push(this.innerGW.put(fragUrl.setParam("ofs", ofs.toString()).URI(), block));
    }
    return ops;
  }

  buildUrl(baseUrl: URI, key: string): Promise<Result<URI>> {
    return this.innerGW.buildUrl(baseUrl, key);
  }

  async destroy(iurl: URI): Promise<Result<void>> {
    return this.innerGW.destroy(iurl);
  }

  async start(url: URI): Promise<Result<URI>> {
    this.headerSize =
      encode({
        fid: this.sthis.nextId(this.fidLength).bin,
        ofs: 1024 * 1024, // 32bit
        len: 16 * 1024 * 1024, // 32bit
        data: new Uint8Array(1024),
      }).length - 1024;
    return this.innerGW.start(url);
  }

  async close(url: URI): Promise<VoidResult> {
    return this.innerGW.close(url);
  }

  async put(url: URI, body: Uint8Array): Promise<VoidResult> {
    await Promise.all(this.slicer(url, body));
    return Result.Ok(undefined);
  }

  async get(url: URI): Promise<GetResult> {
    const rfrags = await getFrags(url, this.innerGW, this.headerSize, this.logger);
    let buffer: Uint8Array | undefined = undefined;
    for (const rfrag of rfrags) {
      if (rfrag.isErr()) {
        return Result.Err(rfrag.Err());
      }
      const frag = rfrag.Ok();
      buffer = buffer || new Uint8Array(frag.len);
      buffer.set(frag.data, frag.ofs);
    }
    return Result.Ok(buffer || new Uint8Array(0));
  }

  async subscribe(url: URI, callback: (msg: Uint8Array) => void): Promise<UnsubscribeResult> {
    if (this.innerGW.subscribe) {
      return this.innerGW.subscribe(url, callback);
    } else {
      return Result.Err(this.logger.Error().Url(url).Msg("subscribe not supported").AsError());
    }
  }

  async delete(url: URI): Promise<VoidResult> {
    const rfrags = await getFrags(url, this.innerGW, this.headerSize, this.logger);
    for (const rfrag of rfrags) {
      if (rfrag.isErr()) {
        return Result.Err(rfrag.Err());
      }
      const frag = rfrag.Ok();
      const fidStr = base58btc.encode(frag.fid);
      const fragUrl = url
        .build()
        .setParam("fid", fidStr)
        .setParam("len", frag.len.toString())
        .setParam("headerSize", this.headerSize.toString())
        .URI();
      await this.innerGW.delete(fragUrl);
    }
    return Result.Ok(undefined);
  }
}
