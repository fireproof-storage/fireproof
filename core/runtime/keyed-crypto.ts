import { CryptoRuntime, Logger, URI } from "@adviser/cement";
import { SuperThis, PARAM, KeyBagIf, KeysByFingerprint } from "@fireproof/core-types-base";
import { BytesAndKeyWithIv, CodecOpts, IvAndKeyAndBytes, IvKeyIdData, CryptoAction } from "@fireproof/core-types-blockstore";
import { ensureLogger, UInt8ArrayEqual } from "./utils.js";
import type { AsyncBlockCodec, ByteView } from "@fireproof/core-types-runtime";
import { base58btc } from "multiformats/bases/base58";
import { sha256 as hasher } from "multiformats/hashes/sha2";
import * as CBOR from "cborg";

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

export class BlockIvKeyIdCodec implements AsyncBlockCodec<24, Uint8Array, IvKeyIdData> {
  readonly code = 24;
  readonly name = "Fireproof@encrypted-block:aes-gcm";

  readonly ko: CryptoAction;
  readonly iv?: Uint8Array;
  readonly opts: Partial<CodecOpts>;
  constructor(ko: CryptoAction, iv?: Uint8Array, opts?: CodecOpts) {
    this.ko = ko;
    this.iv = iv;
    this.opts = opts || {};
  }

  // hashAsBytes(data: IvKeyIdData): AsyncHashAsBytes<Uint8Array<ArrayBufferLike>> {
  //   return data;
  // }

  valueToHashBytes(value: IvKeyIdData): Promise<ByteView<unknown>> {
    return Promise.resolve(value.data);
  }
  bytesToHash(data: Uint8Array): Promise<ByteView<unknown>> {
    return Promise.resolve(data);
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
    } satisfies IvKeyIdData);
  }

  async decode(abytes: Uint8Array | ArrayBuffer): Promise<IvKeyIdData> {
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
    return {
      iv,
      keyId,
      data: result,
    };
  }
}

class cryptoAction implements CryptoAction {
  readonly code = 24;
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
  codec(iv?: Uint8Array, opts?: CodecOpts): AsyncBlockCodec<24, Uint8Array, IvKeyIdData> {
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

/**
 * Factory function to create a CryptoAction for encrypting/decrypting data.
 * Encryption is mandatory - insecure mode is no longer supported.
 *
 * @param url - URI containing store configuration including store key
 * @param kb - KeyBag interface for key management
 * @param sthis - SuperThis context for logging and runtime access
 * @returns CryptoAction instance configured for encryption
 * @throws Error if storekey=insecure is attempted or if key retrieval fails
 */
export async function keyedCryptoFactory(url: URI, kb: KeyBagIf, sthis: SuperThis): Promise<CryptoAction> {
  const storekey = url.getParam(PARAM.STORE_KEY);
  if (storekey === "insecure") {
    throw sthis.logger
      .Error()
      .Str("url", url.toString())
      .Msg(
        "storekey=insecure is no longer supported. " +
          "Data must be encrypted. Remove the storekey=insecure parameter " +
          "to use automatic key generation, or provide a valid encryption key.",
      )
      .AsError();
  }
  if (storekey) {
    const rkey = await kb.getNamedKey(storekey, false);
    if (rkey.isErr()) {
      throw sthis.logger
        .Error()
        .Str("keybag", kb.rt.id())
        .Str("name", storekey)
        .Msg("getNamedKey failed")
        .AsError();
    }
    return new cryptoAction(url, rkey.Ok(), kb.rt.crypto, sthis);
  }
  // No storekey specified - this should not happen in normal operation
  // as ensureKeyFromUrl should always add one, but handle gracefully
  throw sthis.logger
    .Error()
    .Str("url", url.toString())
    .Msg("No store key specified. Use ensureKeyFromUrl to add encryption key to URL.")
    .AsError();
}
