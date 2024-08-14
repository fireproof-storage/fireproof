import { CryptoRuntime, Logger, URI } from "@adviser/cement";
import { BytesWithIv, CodecOpts, IvAndBytes, IvKeyIdData, KeyedCrypto, KeyWithFingerPrint } from "../blockstore";
import { ensureLogger, UInt8ArrayEqual } from "../utils.js";
import { KeyBag } from "./key-bag";
import type { BlockCodec } from "./wait-pr-multiformats/codec-interface";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as dagCodec from "@ipld/dag-cbor";
import { decode, encode } from "./wait-pr-multiformats/block";

interface GenerateIVFn {
  calc(ko: KeyedCrypto, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array>;
  verify(ko: KeyedCrypto, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean>;
}

const generateIV: Record<string, GenerateIVFn> = {
  random: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    calc: async (ko: KeyedCrypto, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array> => {
      return crypto.randomBytes(ko.ivLength);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    verify: async (ko: KeyedCrypto, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean> => {
      return true;
    },
  },
  hash: {
    calc: async (ko: KeyedCrypto, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array> => {
      const hash = await hasher.digest(data);
      const hashBytes = new Uint8Array(hash.bytes);
      const hashArray = new Uint8Array(ko.ivLength * 8);
      for (let i = 0; i < hashBytes.length; i++) {
        hashArray[i % ko.ivLength] ^= hashBytes[i];
      }
      return hashArray;
    },
    verify: async function (ko: KeyedCrypto, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean> {
      return ko.url.getParam("ivverify") !== "disable" && UInt8ArrayEqual(iv, await this.calc(ko, crypto, data));
    },
  },
};

function getGenerateIVFn(url: URI, opts: Partial<CodecOpts>): GenerateIVFn {
  const ivhash = opts.ivCalc || url.getParam("ivhash") || "hash";
  return generateIV[ivhash] || generateIV["hash"];
}

export class BlockIvKeyIdCodec implements BlockCodec<0x300539, Uint8Array> {
  readonly code = 0x300539;
  readonly name = "Fireproof@encrypted-block:aes-gcm";

  readonly ko: KeyedCrypto;
  readonly iv?: Uint8Array;
  readonly opts: Partial<CodecOpts>;
  constructor(ko: KeyedCrypto, iv?: Uint8Array, opts?: CodecOpts) {
    this.ko = ko;
    this.iv = iv;
    this.opts = opts || {};
  }

  async encode(data: Uint8Array): Promise<Uint8Array> {
    const calcIv = this.iv || (await getGenerateIVFn(this.ko.url, this.opts).calc(this.ko, this.ko.crypto, data));
    const { iv } = this.ko.algo(calcIv);
    const fprt = await this.ko.fingerPrint();
    const keyId = base58btc.decode(fprt);
    this.ko.logger.Debug().Str("fp", fprt).Msg("encode");
    return (
      await encode<IvKeyIdData, number, number>({
        value: {
          iv: iv,
          keyId: keyId,
          data: await this.ko._encrypt({ iv, bytes: data }),
        },
        hasher,
        codec: dagCodec,
      })
    ).bytes;
  }

  async decode(abytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (abytes instanceof Uint8Array) {
      bytes = abytes;
    } else {
      bytes = new Uint8Array(abytes);
    }
    const { iv, keyId, data } = (await decode<IvKeyIdData, number, number>({ bytes, hasher, codec: dagCodec })).value;
    const fprt = await this.ko.fingerPrint();
    this.ko.logger.Debug().Str("fp", base58btc.encode(keyId)).Msg("decode");
    if (base58btc.encode(keyId) !== fprt) {
      throw this.ko.logger.Error().Str("fp", fprt).Str("keyId", base58btc.encode(keyId)).Msg("keyId mismatch").AsError();
    }
    const result = await this.ko._decrypt({ iv: iv, bytes: data });
    if (!this.opts?.noIVVerify && !(await getGenerateIVFn(this.ko.url, this.opts).verify(this.ko, this.ko.crypto, iv, result))) {
      throw this.ko.logger.Error().Msg("iv missmatch").AsError();
    }
    return result;
  }
}

class keyedCrypto implements KeyedCrypto {
  readonly ivLength = 12;
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly key: KeyWithFingerPrint;
  readonly isEncrypting = true;
  readonly url: URI;
  constructor(url: URI, key: KeyWithFingerPrint, cyopt: CryptoRuntime, logger: Logger) {
    this.logger = ensureLogger(logger, "keyedCrypto");
    this.crypto = cyopt;
    this.key = key;
    this.url = url;
  }
  fingerPrint(): Promise<string> {
    return Promise.resolve(this.key.fingerPrint);
  }
  codec(iv?: Uint8Array, opts?: CodecOpts): BlockCodec<number, Uint8Array> {
    return new BlockIvKeyIdCodec(this, iv, opts);
  }
  algo(iv?: Uint8Array) {
    return {
      name: "AES-GCM",
      iv: iv || this.crypto.randomBytes(this.ivLength),
      tagLength: 128,
    };
  }
  async _decrypt(data: IvAndBytes): Promise<Uint8Array> {
    this.logger
      .Debug()
      .Len(data.bytes)
      .Str("fp", this.key.fingerPrint)
      // .Hash("iv", data.iv).Hash("bytes", data.bytes)
      .Msg("decrypting");
    return new Uint8Array(await this.crypto.decrypt(this.algo(data.iv), this.key.key, data.bytes));
  }
  async _encrypt(data: BytesWithIv): Promise<Uint8Array> {
    this.logger.Debug().Len(data.bytes).Str("fp", this.key.fingerPrint).Msg("encrypting");
    const a = this.algo(data.iv);
    return new Uint8Array(await this.crypto.encrypt(a, this.key.key, data.bytes));
  }
}

class nullCodec implements BlockCodec<0x0, Uint8Array> {
  readonly code = 0x0;
  readonly name = "Fireproof@unencrypted-block";

  encode(data: Uint8Array): Uint8Array {
    return data;
  }
  decode(data: Uint8Array): Uint8Array {
    return data;
  }
}

class noCrypto implements KeyedCrypto {
  readonly ivLength = 0;
  readonly code = 0x0;
  readonly name = "Fireproof@unencrypted-block";
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly isEncrypting = false;
  readonly _fingerPrint = "noCrypto:" + Math.random();
  readonly url: URI;
  constructor(url: URI, cyrt: CryptoRuntime, logger: Logger) {
    this.logger = ensureLogger(logger, "noCrypto");
    this.crypto = cyrt;
    this.url = url;
  }

  fingerPrint(): Promise<string> {
    return Promise.resolve(this._fingerPrint);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  codec(iv?: Uint8Array): BlockCodec<number, Uint8Array> {
    return new nullCodec();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  algo(iv?: Uint8Array): { name: string; iv: Uint8Array; tagLength: number } {
    return {
      name: "noCrypto",
      iv: new Uint8Array(),
      tagLength: 0,
    };
  }
  _decrypt(): Promise<Uint8Array> {
    throw this.logger.Error().Msg("noCrypto.decrypt not implemented").AsError();
  }
  _encrypt(): Promise<Uint8Array> {
    throw this.logger.Error().Msg("noCrypto.decrypt not implemented").AsError();
  }
}

export async function keyedCryptoFactory(url: URI, kb: KeyBag, logger: Logger): Promise<KeyedCrypto> {
  const storekey = url.getParam("storekey");
  if (storekey && storekey !== "insecure") {
    let rkey = await kb.getNamedKey(storekey, true);
    if (rkey.isErr()) {
      try {
        rkey = await kb.toKeyWithFingerPrint(storekey);
      } catch (e) {
        throw (
          logger
            .Error()
            .Err(e)
            .Str("keybag", kb.rt.id())
            // .Result("key", rkey)
            .Str("name", storekey)
            .Msg("getNamedKey failed")
            .AsError()
        );
      }
    }
    return new keyedCrypto(url, rkey.Ok(), kb.rt.crypto, logger);
  }
  return new noCrypto(url, kb.rt.crypto, logger);
}
