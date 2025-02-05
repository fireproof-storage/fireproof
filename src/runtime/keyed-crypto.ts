import { CryptoRuntime, Logger, URI } from "@adviser/cement";
import {
  BytesAndKeyWithIv,
  CodecOpts,
  IvAndKeyAndBytes,
  IvKeyIdData,
  CryptoAction,
  KeysByFingerprint,
} from "../blockstore/index.js";
import { ensureLogger, UInt8ArrayEqual } from "../utils.js";
import { KeyBag } from "./key-bag.js";
import type { BlockCodec } from "./wait-pr-multiformats/codec-interface.js";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as CBOR from "cborg";
import { PARAM, SuperThis } from "../types.js";

interface GenerateIVFn {
  calc(ko: CryptoAction, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array>;
  verify(ko: CryptoAction, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean>;
}

const generateIV: Record<string, GenerateIVFn> = {
  random: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    calc: async (ko: CryptoAction, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array> => {
      return crypto.randomBytes(ko.ivLength);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    verify: async (ko: CryptoAction, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean> => {
      return true;
    },
  },
  hash: {
    calc: async (ko: CryptoAction, crypto: CryptoRuntime, data: Uint8Array): Promise<Uint8Array> => {
      const hash = await hasher.digest(data);
      const hashBytes = new Uint8Array(hash.bytes);
      const hashArray = new Uint8Array(ko.ivLength);
      for (let i = 0; i < hashBytes.length; i++) {
        hashArray[i % ko.ivLength] ^= hashBytes[i];
      }
      return hashArray;
    },
    verify: async function (ko: CryptoAction, crypto: CryptoRuntime, iv: Uint8Array, data: Uint8Array): Promise<boolean> {
      return ko.url.getParam(PARAM.IV_VERIFY) !== "disable" && UInt8ArrayEqual(iv, await this.calc(ko, crypto, data));
    },
  },
};

function getGenerateIVFn(url: URI, opts: Partial<CodecOpts>): GenerateIVFn {
  const ivhash = opts.ivCalc || url.getParam(PARAM.IV_HASH) || "hash";
  return generateIV[ivhash] || generateIV["hash"];
}

export class BlockIvKeyIdCodec implements BlockCodec<0x300539, Uint8Array> {
  readonly code = 0x300539;
  readonly name = "Fireproof@encrypted-block:aes-gcm";

  readonly ko: CryptoAction;
  readonly iv?: Uint8Array;
  readonly opts: Partial<CodecOpts>;
  constructor(ko: CryptoAction, iv?: Uint8Array, opts?: CodecOpts) {
    this.ko = ko;
    this.iv = iv;
    this.opts = opts || {};
  }

  async encode(data: Uint8Array): Promise<Uint8Array> {
    const calcIv = this.iv || (await getGenerateIVFn(this.ko.url, this.opts).calc(this.ko, this.ko.crypto, data));
    const { iv } = this.ko.algo(calcIv);

    const defKey = await this.ko.key.get();
    if (!defKey) {
      throw this.ko.logger.Error().Msg("default key not found").AsError();
    }
    const keyId = base58btc.decode(defKey?.fingerPrint);
    this.ko.logger.Debug().Str("fp", defKey.fingerPrint).Msg("encode");
    return CBOR.encode({
      iv: iv,
      keyId: keyId,
      data: await this.ko._encrypt({ iv, key: defKey.key, bytes: data }),
    } as IvKeyIdData);
  }

  async decode(abytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (abytes instanceof Uint8Array) {
      bytes = abytes;
    } else {
      bytes = new Uint8Array(abytes);
    }
    const { iv, keyId, data } = CBOR.decode(bytes) as IvKeyIdData;
    const key = await this.ko.key.get(keyId);
    if (!key) {
      throw this.ko.logger.Error().Str("fp", base58btc.encode(keyId)).Msg("keyId not found").AsError();
    }
    const result = await this.ko._decrypt({ iv: iv, key: key.key, bytes: data });
    if (!this.opts?.noIVVerify && !(await getGenerateIVFn(this.ko.url, this.opts).verify(this.ko, this.ko.crypto, iv, result))) {
      throw this.ko.logger.Error().Msg("iv missmatch").AsError();
    }
    return result;
  }
}

class cryptoAction implements CryptoAction {
  readonly ivLength = 12;
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly key: KeysByFingerprint;
  readonly isEncrypting = true;
  readonly url: URI;
  constructor(url: URI, key: KeysByFingerprint, cyopt: CryptoRuntime, sthis: SuperThis) {
    this.logger = ensureLogger(sthis, "cryptoAction");
    this.crypto = cyopt;
    this.key = key;
    this.url = url;
  }

  // keyByFingerPrint(id: Uint8Array | string): Promise<Result<KeyWithFingerPrint>> {
  //   return this.key.get(id)
  // }

  // fingerPrint(): Promise<string> {
  //   return this.key.get().then((k) => k.fingerPrint);
  // }
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
  async _decrypt(data: IvAndKeyAndBytes): Promise<Uint8Array> {
    // this.logger.Debug().Len(data.bytes, "bytes").Len(data.iv, "iv").Str("fp", data.key).Msg("decrypting");
    return new Uint8Array(await this.crypto.decrypt(this.algo(data.iv), data.key, data.bytes));
  }
  async _encrypt(data: BytesAndKeyWithIv): Promise<Uint8Array> {
    // const key = await this.key.get()
    // this.logger.Debug().Len(data.bytes).Str("fp", key.fingerPrint).Msg("encrypting");
    const a = this.algo(data.iv);
    return new Uint8Array(await this.crypto.encrypt(a, data.key, data.bytes));
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

class noCrypto implements CryptoAction {
  readonly ivLength = 0;
  readonly code = 0x0;
  readonly name = "Fireproof@unencrypted-block";
  readonly logger: Logger;
  readonly crypto: CryptoRuntime;
  readonly key: KeysByFingerprint;
  readonly isEncrypting = false;
  readonly _fingerPrint = "noCrypto:" + Math.random();
  readonly url: URI;
  constructor(url: URI, cyrt: CryptoRuntime, sthis: SuperThis) {
    this.logger = ensureLogger(sthis, "noCrypto");
    this.crypto = cyrt;
    this.key = {
      id: sthis.nextId().str,
      name: "noCrypto",
      get: () => {
        throw this.logger.Error().Msg("noCrypto.get not implemented").AsError();
      },
      upsert: () => {
        throw this.logger.Error().Msg("noCrypto.upsert not implemented").AsError();
      },
      asKeysItem: () => {
        throw this.logger.Error().Msg("noCrypto.asKeysItem not implemented").AsError();
      },
    };
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

export async function keyedCryptoFactory(url: URI, kb: KeyBag, sthis: SuperThis): Promise<CryptoAction> {
  const storekey = url.getParam(PARAM.STORE_KEY);
  if (storekey && storekey !== "insecure") {
    const rkey = await kb.getNamedKey(storekey, false);
    if (rkey.isErr()) {
      // try {
      //   rkey = await kb.toKeyWithFingerPrint(storekey);
      // } catch (e) {
      throw (
        sthis.logger
          .Error()
          // .Err(e)
          .Str("keybag", kb.rt.id())
          // .Result("key", rkey)
          .Str("name", storekey)
          .Msg("getNamedKey failed")
          .AsError()
      );
      // }
    }
    return new cryptoAction(url, rkey.Ok(), kb.rt.crypto, sthis);
  }
  return new noCrypto(url, kb.rt.crypto, sthis);
}
