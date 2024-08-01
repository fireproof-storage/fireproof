import { sha256 } from "multiformats/hashes/sha2";
// import { CID } from "multiformats";
import { encode, decode, create as mfCreate } from "../runtime/wait-pr-multiformats/block.js";
// import type { MultihashHasher, ToString } from "multiformats";

import type { CarReader } from "@ipld/car";
import * as dagcbor from "@ipld/dag-cbor";

import { MemoryBlockstore } from "@web3-storage/pail/block";

// @ts-expect-error "prolly-trees" has no types
import { bf } from "prolly-trees/utils";
// @ts-expect-error "prolly-trees" has no types
import { nocache as cache } from "prolly-trees/cache";
// @ts-expect-error "prolly-trees" has no types
import { create, load } from "prolly-trees/cid-set";

// import { encodeCarFile } from "./loader-helpers.js";
// import { makeCodec } from "./encrypt-codec.js";
import type { AnyLinkFn, AnyBlock, AnyLink, KeyedCrypto, AnyDecodedBlock } from "./types.js";
import { Logger } from "@adviser/cement";
import { BlockCodec, CID, MultihashHasher, ToString } from "multiformats";
import { ensureLogger } from "../utils.js";

function carLogIncludesGroup(list: AnyLink[], cidMatch: AnyLink) {
  return list.some((cid: AnyLink) => {
    return cid.toString() === cidMatch.toString();
  });
}

type getFn = (cid: AnyLink) => Promise<AnyBlock | undefined>;

function getWithByCodec(get: getFn, hasher: MultihashHasher<number>, codec: BlockCodec<number, unknown>): getFn {
  return (cid: AnyLink) =>
    get(cid).then(async (block) => {
      if (!block) return;
      const decoded = await decode({ ...block, codec, hasher });
      return decoded;
    });
}

export class EnDeCryptor<T = Uint8Array> {
  readonly logger: Logger;
  readonly kycr: KeyedCrypto;
  constructor(logger: Logger, kycr: KeyedCrypto) {
    this.kycr = kycr;
    this.logger = ensureLogger(logger, "EnDeCryptor");
  }
  async *encrypt({
    get,
    cids,
    hasher,
    cache,
    chunker,
    rootCid,
  }: {
    get: (cid: AnyLink) => Promise<AnyBlock | undefined>;
    cids: AnyLink[];
    hasher: MultihashHasher<number>;
    chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>;
    cache: (cid: AnyLink) => Promise<AnyBlock>;
    rootCid: AnyLink;
  }): AsyncGenerator<T, void, unknown> {
    const set = new Set<ToString<AnyLink>>();
    let eroot;
    if (!carLogIncludesGroup(cids, rootCid)) {
      this.logger.Debug().Str("rootCid", rootCid.toString()).Msg("rootCid not in cids");
      cids.push(rootCid);
    }
    // write encoded CID's
    for (const cid of cids) {
      const unencrypted = await get(cid);
      if (!unencrypted) throw this.logger.Error().Ref("cid", cid).Msg("missing cid block").AsError();
      const block = await encode({ value: unencrypted.bytes, codec: this.kycr.codec(), hasher });
      this.logger
        .Debug()
        .Str("cid", block.cid.toString())
        .Len(block.bytes)
        /*.Any("stack", (new Error).stack)*/ .Msg("encrypt-cid");
      yield block as T;
      set.add(block.cid.toString());
      if (unencrypted.cid.equals(rootCid)) eroot = block.cid;
    }
    if (!eroot) throw this.logger.Error().Msg("cids does not include root").AsError();
    const list = [...set].map((s) => CID.parse(s));
    let last;
    this.logger
      .Debug()
      .Str("cid", rootCid.toString())
      .Any("list", list.map((i) => i.toString()).sort())
      .Msg("encrypt-node");
    for await (const node of create({ list, get, cache, chunker, hasher, codec: dagcbor })) {
      const block = (await node.block) as AnyBlock;
      yield block as T;
      last = block;
    }
    if (!last) throw this.logger.Error().Msg("missing last block").AsError();
    const head = { root: eroot, last: last.cid };
    const block = await encode({ value: head, codec: dagcbor, hasher });
    this.logger.Debug().Str("cid", block.cid.toString()).Any("head", head).Msg("encrypt-root");
    yield block as T;
  }

  async *decrypt({
    rootCid,
    get: iget,
    cache,
    chunker,
    hasher,
  }: {
    rootCid: AnyLink;
    get: (cid: AnyLink) => Promise<AnyBlock | undefined>;
    cache: (cid: AnyLink) => Promise<AnyBlock>;
    chunker: (bytes: Uint8Array) => AsyncGenerator<Uint8Array>;
    hasher: MultihashHasher<number>;
  }): AsyncGenerator<AnyBlock, void, undefined> {
    const get = (cid: AnyLink) => {
      // this.logger.Debug().Str("cid", cid.toString()).Msg("decrypt-get");
      return iget(cid);
    };
    const decodedRoot = await getWithByCodec(get, hasher, dagcbor)(rootCid);
    if (!decodedRoot) throw this.logger.Error().Msg("missing root").AsError();
    if (!decodedRoot.bytes) throw this.logger.Error().Msg("missing bytes").AsError();
    const {
      value: { root: eroot, last: tree },
      // value: [eroot, tree],
    } = decodedRoot as unknown as {
      value: {
        root: CID;
        last: CID;
      };
    };
    this.logger
      .Debug()
      .Str("cid", rootCid.toString())
      .Any("head", { root: eroot.toString(), last: tree.toString() })
      .Msg("decrypting-head");

    const rootBlock = (await get(eroot)) as AnyDecodedBlock;
    if (!rootBlock) throw this.logger.Error().Msg("missing root block").AsError();

    const cidset = await load({
      cid: tree,
      get: getWithByCodec(get, hasher, dagcbor),
      cache,
      chunker,
      /*codec: this.kycr.codec,*/ hasher,
    });
    const { result: nodes } = (await cidset.getAllEntries()) as { result: { cid: CID }[] };
    this.logger
      .Debug()
      .Str("cid", tree.toString())
      .Any("list", nodes.map(({ cid }) => cid.toString()).sort())
      .Msg("decrypting-list");
    const toBlock = async (eblock?: AnyBlock) => {
      if (!eblock) throw this.logger.Error().Msg("missing block").AsError();
      const adb = eblock as AnyDecodedBlock;
      if (!adb.value) {
        throw this.logger.Error().Msg("missing value").AsError();
      }
      // adb = await decode({ ...eblock, codec: this.kycr.codec()/*
      //   {
      //     code: this.kycr.codec().code,
      //     decode: async (bytes) => new Uint8Array(bytes),
      //   }
      //   */, hasher });
      // if (!adb.value) throw this.logger.Error().Msg("missing value").AsError();
      // this.logger.Debug().Str("cid", eblock.cid.toString())
      //   .Len(adb.bytes)
      //   .Any("eblock", Object.keys(eblock)).Msg("decrypting-synunwrap")
      // } else {
      this.logger.Debug().Str("cid", adb.cid.toString()).Len(adb.bytes).Msg("decrypting-unwrap");
      // }
      const block = await mfCreate({
        cid: adb.cid,
        bytes: adb.bytes,
        hasher,
        codec: {
          // noop codec
          code: 0,
          decode: async (bytes) => bytes,
        },
      });
      return block as AnyBlock;
    };

    // const unwrap = async (eblock?: AnyDecodedBlock) => {
    //   if (!eblock) throw logger.Error().Msg("missing block").AsError();
    //   if (!eblock.value) {
    //     eblock = await decode({ ...eblock, codec, hasher });
    //     if (!eblock.value) throw logger.Error().Msg("missing value").AsError();
    //   }
    //   const { bytes, cid } = await codec.decrypt({ ...eblock, key }).catch((e) => {
    //     throw e;
    //   });
    //   const block = await mfCreate({ cid, bytes, hasher, codec });
    //   return block;
    // };

    const promises = [];
    for (const { cid } of nodes) {
      if (!rootBlock.cid.equals(cid)) {
        this.logger
          .Debug()
          .Str("root", rootBlock.cid.toString())
          .Str("cid", (cid as CID).toString())
          .Msg("decrypting-nodes");
        promises.push(getWithByCodec(get, hasher, this.kycr.codec())(cid).then(toBlock));
      }
    }
    yield* promises;
    // this.logger.Debug().Str("cid", rootBlock.cid.toString()).Msg("decrypting-root");
    // yield mfCreate({
    //   cid: rootBlock.cid,
    //   bytes: rootBlock.bytes,
    //   hasher,
    //   codec: { // noop codec
    //     code: 0,
    //     decode: async (bytes) => bytes,
    //   }
    // });
  }
  // return { encrypt, decrypt };
}

const chunker = bf(30);

// export async function encryptedEncodeCarFile(
//   logger: Logger,
//   keyedCrypto: KeyedCrypto,
//   rootCid: AnyLink,
//   t: CarMakeable,
// ): Promise<AnyBlock> {
//   // const encryptionKey = hexStringToUint8Array(key);
//   const encryptedBlocks = new MemoryBlockstore();
//   const cidsToEncrypt = [] as AnyLink[];
//   for (const { cid, bytes } of t.entries()) {
//     cidsToEncrypt.push(cid);
//     const g = await t.get(cid);
//     if (!g) throw logger.Error().Ref("cid", cid).Int("bytes", bytes.length).Msg("missing cid block").AsError();
//   }
//   let last: AnyBlock | undefined = undefined;
//   // const { encrypt } = makeEncDec(logger, keyedCrypto);
//   const encDec = new EnDeCryptor(logger, keyedCrypto);

//   for await (const block of encDec.encrypt({
//     cids: cidsToEncrypt,
//     get: t.get.bind(t),
//     hasher: sha256,
//     chunker,
//     cache,
//     rootCid: rootCid,
//   }) as AsyncGenerator<AnyBlock, void, unknown>) {
//     await encryptedBlocks.put(block.cid, block.bytes);
//     last = block;
//   }
//   if (!last) throw logger.Error().Msg("no blocks encrypted").AsError();
//   const encryptedCar = await encodeCarFile([last.cid], encryptedBlocks);
//   return encryptedCar;
// }

export async function decodeEncryptedCar(logger: Logger, kycy: KeyedCrypto, reader: CarReader) {
  const roots = await reader.getRoots();
  const root = roots[0];
  return await decodeCarBlocks(logger, kycy, root, reader.get.bind(reader) as AnyLinkFn);
}
async function decodeCarBlocks(
  logger: Logger,
  kycy: KeyedCrypto,
  root: AnyLink,
  get: (cid: AnyLink) => Promise<AnyBlock | undefined>,
): Promise<{ blocks: MemoryBlockstore; root: AnyLink }> {
  // const decryptionKeyUint8 = hexStringToUint8Array(keyMaterial);
  // const decryptionKey = decryptionKeyUint8.buffer.slice(0, decryptionKeyUint8.byteLength);
  const decryptedBlocks = new MemoryBlockstore();
  let last: AnyBlock | undefined = undefined;

  // const { decrypt } = makeEncDec(logger, kycy);
  const encDec = new EnDeCryptor(logger, kycy);

  const prevGet = decryptedBlocks.get;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decryptedBlocks.get = async (blocks: any): Promise<any> => {
    logger.Debug().Any("blocks", blocks).Msg("decryptedBlocks-get");
    return prevGet.apply(decryptedBlocks, [blocks]);
  };

  for await (const block of encDec.decrypt({
    rootCid: root,
    get,
    hasher: sha256,
    chunker,
    cache,
  })) {
    logger.Debug().Str("cid", block.cid.toString()).Len(block.bytes).Msg("decrypted-block");
    await decryptedBlocks.put(block.cid, block.bytes);
    last = block;
  }
  if (!last) throw logger.Error().Msg("no blocks decrypted").AsError();
  return { blocks: decryptedBlocks, root: last.cid };
}
