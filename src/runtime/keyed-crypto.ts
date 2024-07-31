import { Logger } from "@adviser/cement";
import { BytesWithIv, CryptoRuntime, IvAndBytes, KeyedCrypto, KeyWithFingerPrint } from "../blockstore";
import { ensureLogger } from "../utils.js";
import { KeyBag } from "./key-bag";
import type { BlockCodec } from "multiformats";

export function hexStringToUint8Array(hexString: string) {
    const length = hexString.length;
    const uint8Array = new Uint8Array(length / 2);
    for (let i = 0; i < length; i += 2) {
        uint8Array[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return uint8Array;
}

export function toHexString(byteArray: Uint8Array) {
    return Array.from(byteArray)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

//   function enc32(value: number) {
//     value = +value;
//     const buff = new Uint8Array(4);
//     buff[3] = value >>> 24;
//     buff[2] = value >>> 16;
//     buff[1] = value >>> 8;
//     buff[0] = value & 0xff;
//     return buff;
//   };

//   function readUInt32LE(buffer: Uint8Array) {
//     const offset = buffer.byteLength - 4;
//     return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)) + buffer[offset + 3] * 0x1000000;
//   };


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

class keyedCodec implements BlockCodec<0x300539, Uint8Array> {
    readonly code = 0x300539;
    readonly name = "Fireproof@encrypted-block:aes-gcm";

    constructor(readonly cy: keyedCrypto, readonly iv?: Uint8Array) { }

    async encode(data: Uint8Array): Promise<Uint8Array> {
        const { iv } = this.cy.algo(this.iv);
        return concat([iv, await this.cy._encrypt({ iv, bytes: data })]);
    }

    async decode(abytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
        let bytes: Uint8Array;
        if (abytes instanceof Uint8Array) {
            bytes = abytes;
        } else {
            bytes = new Uint8Array(abytes);
        }
        const iv = bytes.subarray(0, 12);
        return this.cy._decrypt({ iv, bytes: bytes.slice(12) });
    }
}


class keyedCrypto implements KeyedCrypto {

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
            iv: iv || this.crypto.randomBytes(12),
            tagLength: 128,
        }
    }
    async _decrypt(data: IvAndBytes): Promise<Uint8Array> {
        return new Uint8Array(await this.crypto.decrypt(
            this.algo(data.iv),
            this.key.key,
            data.bytes,
        ))
    }
    async _encrypt(data: BytesWithIv): Promise<Uint8Array> {
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
    readonly _fingerPrint = 'noCrypto:'+Math.random();
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