import { Logger, Result, URI } from "@adviser/cement";

import { base58btc } from "multiformats/bases/base58";
import { encode, decode } from "cborg";
import { VoidResult } from "./gateway.js";
import { PARAM, SuperThis } from "../types.js";
import { ensureLogger } from "../utils.js";
import { Fragment } from "react";

function getFragSize(url: URI): number {
  const fragSize = url.getParam(PARAM.FRAG_SIZE);
  let ret = 0;
  if (fragSize) {
    ret = parseInt(fragSize);
  }
  if (isNaN(ret) || ret <= 0) {
    ret = 0;
  }
  return ret;
}

async function getFrags(url: URI, transport: Transport, headerSize: number, logger: Logger): Promise<Result<FragmentData>[]> {
  const fragSize = getFragSize(url);
  const frag: Fragment = {
    fid: new Uint8Array(),
    ofs: 0,
    len: 0,
  };
  if (!fragSize) {
    const res = await transport.get(url, frag);
    if (res.isErr()) {
      return [res as Result<FragmentData>];
    }
    const fragData = res.unwrap();
    return [
      Result.Ok({
        ...frag,
        len: fragData.data.length,
        data: fragData.data,
      }),
    ];
  }
  const firstRaw = await transport.get(url.build().setParam("ofs", "0").URI(), frag);
  if (firstRaw.isErr()) {
    return [firstRaw as Result<FragmentData>];
  }
  const firstFragment = decode(firstRaw.unwrap().data) as FragmentData;
  const blockSize = firstFragment.data.length;
  const ops: Promise<Result<FragmentData>>[] = [Promise.resolve(Result.Ok(firstFragment))];
  const fidStr = base58btc.encode(firstFragment.fid);
  const fragUrl = url
    .build()
    .setParam(PARAM.FRAG_FID, fidStr)
    .setParam(PARAM.FRAG_LEN, firstFragment.len.toString())
    .setParam(PARAM.FRAG_HEAD, headerSize.toString());

  for (let ofs = blockSize; ofs < firstFragment.len; ofs += blockSize) {
    ops.push(
      (async (furl, ofs): Promise<Result<FragmentData>> => {
        const raw = await transport.get(furl, {
          fid: firstFragment.fid,
          ofs: ofs,
          len: firstFragment.len,
        });
        if (raw.isErr()) {
          return raw as Result<FragmentData>;
        }
        const fragment = decode(raw.unwrap().data) as FragmentData;
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

export interface Fragment {
  readonly fid: Uint8Array;
  readonly ofs: number;
  readonly len: number;
}

export interface FragmentData extends Fragment {
  readonly data: Uint8Array;
}

export interface Transport {
  start(url: URI): Promise<Result<URI>>;
  put(url: URI, frag: FragmentData): Promise<VoidResult>;
  get(url: URI, frag: Fragment): Promise<Result<FragmentData>>;
  delete(url: URI, frag: Fragment): Promise<VoidResult>;
  close(url: URI): Promise<VoidResult>;
}

export class Fragmentor {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fidLength = 4;

  readonly transport: Transport;
  headerSize = 32;

  constructor(sthis: SuperThis, transport: Transport) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "Fragmentor");
    this.transport = transport;
  }

  slicer(url: URI, body: Uint8Array): Promise<VoidResult>[] {
    const fragSize = getFragSize(url);
    if (!fragSize) {
      return [
        this.transport.put(url, {
          fid: this.sthis.nextId(this.fidLength).bin,
          ofs: 0,
          len: body.length,
          data: body,
        }),
      ];
    }
    const blocksize = fragSize - this.headerSize;
    if (blocksize <= 0) {
      throw this.logger
        .Error()
        .Uint64(PARAM.FRAG_SIZE, fragSize)
        .Uint64(PARAM.FRAG_HEAD, this.headerSize)
        .Msg("Fragment size is too small")
        .AsError();
    }
    const ops: Promise<VoidResult>[] = [];
    const fid = this.sthis.nextId(this.fidLength);
    const fragUrl = url
      .build()
      .setParam(PARAM.FRAG_FID, fid.str)
      .setParam(PARAM.FRAG_LEN, body.length.toString())
      .setParam(PARAM.FRAG_HEAD, this.headerSize.toString());
    for (let ofs = 0; ofs < body.length; ofs += blocksize) {
      const frag: FragmentData = {
        fid: fid.bin,
        ofs,
        len: body.length,
        data: body.slice(ofs, ofs + blocksize),
      };
      const block = encode(frag);
      if (block.length > fragSize) {
        throw this.logger.Error().Uint64("block", block.length).Uint64("fragSize", fragSize).Msg("Block size to big").AsError();
      }
      ops.push(
        this.transport.put(fragUrl.setParam("ofs", ofs.toString()).URI(), {
          ...frag,
          // bit strange contains the header + data
          data: block,
        }),
      );
    }
    return ops;
  }

  async start(url: URI): Promise<Result<URI>> {
    this.headerSize =
      encode({
        fid: this.sthis.nextId(this.fidLength).bin,
        ofs: 1024 * 1024, // 32bit
        len: 16 * 1024 * 1024, // 32bit
        data: new Uint8Array(1024),
      }).length - 1024;
    return this.transport.start(url);
  }

  async close(url: URI): Promise<VoidResult> {
    return this.transport.close(url);
  }

  async put(url: URI, body: Uint8Array): Promise<VoidResult> {
    await Promise.all(this.slicer(url, body));
    return Result.Ok(undefined);
  }

  async get(url: URI): Promise<Result<Uint8Array>> {
    const rfrags = await getFrags(url, this.transport, this.headerSize, this.logger);
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

  async delete(url: URI): Promise<VoidResult> {
    const rfrags = await getFrags(url, this.transport, this.headerSize, this.logger);
    for (const rfrag of rfrags) {
      if (rfrag.isErr()) {
        return Result.Err(rfrag.Err());
      }
      const frag = rfrag.Ok();
      let fragUrl: URI;
      // if no fragments, just delete the url
      if (rfrags.length > 1) {
        const fidStr = base58btc.encode(frag.fid);
        fragUrl = url
          .build()
          .setParam(PARAM.FRAG_FID, fidStr)
          .setParam(PARAM.FRAG_LEN, frag.len.toString())
          .setParam(PARAM.FRAG_HEAD, this.headerSize.toString())
          .URI();
      } else {
        fragUrl = url;
      }
      await this.transport.delete(fragUrl, {
        fid: frag.fid,
        ofs: frag.ofs,
        len: frag.len,
      });
    }
    return Result.Ok(undefined);
  }
}
