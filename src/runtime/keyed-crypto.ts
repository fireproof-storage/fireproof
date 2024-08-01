import { Logger } from "@adviser/cement";
import { BytesWithIv, CryptoRuntime, IvAndBytes, KeyedCrypto, KeyWithFingerPrint } from "../blockstore";
import { ensureLogger } from "../utils.js";
import { KeyBag } from "./key-bag";
import type { BlockCodec } from "multiformats";
import { base58btc } from "multiformats/bases/base58";

function concat(buffers: (ArrayBuffer | Uint8Array)[]) {
    const uint8Arrays = buffers.map((b) => (b instanceof ArrayBuffer ? new Uint8Array(b) : b));
    const totalLength = uint8Arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const arr of uint8Arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }

    return result;
}


export function encodeRunLength(data: Uint8Array, logger: Logger): Uint8Array {
    if (data.length < 0x80) {
        return new Uint8Array([data.length, ...data]);
    }
    if (data.length > 0x7fffffff) {
        throw logger.Error().Len(data).Msg("enRl:data len 31Bit").AsError();
    }
    const length = data.length | 0x80000000;  // MSB is set to indicate that the length is encoded as 32Bit
    return new Uint8Array([
        (length & 0xff000000) >> 24,
        (length & 0x00ff0000) >> 16,
        (length & 0x0000ff00) >> 8,
        (length & 0x000000ff),
        ...data
    ])
}

export function decodeRunLength(data: Uint8Array, ofs: number, logger: Logger): {
    data: Uint8Array,
    next: number
} {
    if (data.length - ofs < 1) {
        throw logger.Error().Len(data).Msg("deRl:data too short").AsError();
    }
    let length: number
    let rl: number
    if (data[ofs] & 0x80) {
        length = (
            ((data[ofs] & 0x7f) << 24) |
            (data[ofs + 1] << 16) |
            (data[ofs + 2] << 8) |
            data[ofs + 3])
        rl = 4
    } else {
        length = data[ofs]
        rl = 1
    }
    if (length > data.length - ofs - rl) {
        throw logger.Error().Len(data).Uint64("ofs", ofs).Msg("deRl:data decodeError").AsError();
    }
    return {
        data: data.slice(ofs + rl, ofs+rl+length),
        next: ofs + length + rl
    }
}


class keyedCodec implements BlockCodec<0x300539, Uint8Array> {
    readonly code = 0x300539;
    readonly name = "Fireproof@encrypted-block:aes-gcm";

    readonly ko: keyedCrypto
    readonly iv?: Uint8Array
    constructor(ko: keyedCrypto, iv?: Uint8Array) {
        this.ko = ko;
        this.iv = iv;
    }

    async encode(data: Uint8Array): Promise<Uint8Array> {
        const { iv } = this.ko.algo(this.iv);
        const keyId = base58btc.decode(this.ko.key.fingerPrint);
        this.ko.logger.Debug().Str("fp", this.ko.key.fingerPrint).Msg("encode");
        return concat([
            encodeRunLength(iv, this.ko.logger),
            encodeRunLength(keyId, this.ko.logger),
            // not nice it is a copy of the data
            encodeRunLength(await this.ko._encrypt({ iv, bytes: data }), this.ko.logger)
        ]);
    }

    async decode(abytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
        let bytes: Uint8Array;
        if (abytes instanceof Uint8Array) {
            bytes = abytes;
        } else {
            bytes = new Uint8Array(abytes);
        }
        const iv = decodeRunLength(bytes, 0, this.ko.logger);
        const keyId = decodeRunLength(bytes, iv.next, this.ko.logger);
        const data = decodeRunLength(bytes, keyId.next, this.ko.logger);
        this.ko.logger.Debug().Str("fp", base58btc.encode(keyId.data)).Msg("decode");
        if (base58btc.encode(keyId.data) !== this.ko.key.fingerPrint) {
            throw this.ko.logger.Error().Str("fp", this.ko.key.fingerPrint).Str("keyId", base58btc.encode(keyId.data)).Msg("keyId mismatch").AsError()
        }
        return this.ko._decrypt({ iv:iv.data, bytes: data.data });
    }
}


class keyedCrypto implements KeyedCrypto {

    readonly ivLength = 12;

    readonly logger: Logger;
    readonly crypto: CryptoRuntime;
    readonly key: KeyWithFingerPrint;
    readonly isEncrypting = true;
    constructor(key: KeyWithFingerPrint, cyopt: CryptoRuntime, logger: Logger) {
        this.logger = ensureLogger(logger, "keyedCrypto");
        this.crypto = cyopt;
        this.key = key;
    }
    fingerPrint(): Promise<string> {
        return Promise.resolve(this.key.fingerPrint);
    }
    codec(iv?: Uint8Array): BlockCodec<number, Uint8Array> {
        return new keyedCodec(this, iv);
    }
    algo(iv?: Uint8Array) {
        return {
            name: "AES-GCM",
            iv: iv || this.crypto.randomBytes(this.ivLength),
            tagLength: 128,
        }
    }
    async _decrypt(data: IvAndBytes): Promise<Uint8Array> {
        this.logger.Debug().Len(data.bytes)
            .Str("fp", this.key.fingerPrint)
            // .Hash("iv", data.iv).Hash("bytes", data.bytes)
            .Msg("decrypting");
        return new Uint8Array(await this.crypto.decrypt(
            this.algo(data.iv),
            this.key.key,
            data.bytes,
        ))
    }
    async _encrypt(data: BytesWithIv): Promise<Uint8Array> {
        this.logger.Debug().Len(data.bytes)
            .Str("fp", this.key.fingerPrint)
            .Msg("encrypting");
        const a = this.algo(data.iv);
        return new Uint8Array(await this.crypto.encrypt(a, this.key.key, data.bytes))
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
    readonly code = 0x0;
    readonly name = "Fireproof@unencrypted-block";
    readonly logger: Logger;
    readonly crypto: CryptoRuntime;
    readonly isEncrypting = false;
    readonly _fingerPrint = 'noCrypto:' + Math.random();
    constructor(cyrt: CryptoRuntime, logger: Logger) {
        this.logger = ensureLogger(logger, "noCrypto");
        this.crypto = cyrt;
    }

    fingerPrint(): Promise<string> {
        return Promise.resolve(this._fingerPrint);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    codec(iv?: Uint8Array): BlockCodec<number, Uint8Array> {
        return new nullCodec();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    algo(iv?: Uint8Array): { name: string; iv: Uint8Array; tagLength: number; } {
        return {
            name: "noCrypto",
            iv: new Uint8Array(),
            tagLength: 0,
        }
    }
    _decrypt(): Promise<ArrayBuffer> {
        throw this.logger.Error().Msg("noCrypto.decrypt not implemented").AsError();
    }
    _encrypt(): Promise<Uint8Array> {
        throw this.logger.Error().Msg("noCrypto.decrypt not implemented").AsError();
    }
}


export async function keyedCryptoFactory(url: URL, kb: KeyBag, logger: Logger): Promise<KeyedCrypto> {
    const storekey = url.searchParams.get("storekey");
    if (storekey && storekey !== "insecure") {
        let rkey = await kb.getNamedKey(storekey, true);
        if (rkey.isErr()) {
            try {
                rkey = await kb.toKeyWithFingerPrint(storekey);
            } catch (e) {
                throw logger.Error()
                    .Err(e)
                    .Str("keybag", kb.rt.id())
                    // .Result("key", rkey)
                    .Str("name", storekey).Msg("getNamedKey failed").AsError();
            }
        }
        return new keyedCrypto(rkey.Ok(), kb.rt.crypto, logger);
    }
    return new noCrypto(kb.rt.crypto, logger);
}