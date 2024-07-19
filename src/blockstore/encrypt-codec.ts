import { CID } from "multiformats";
import type { AnyLink, CryptoOpts, DecryptOpts, EncryptOpts } from "./types.js";
import { ensureLogger } from "../utils.js";
import { Logger } from "@adviser/cement";

export function makeCodec(ilogger: Logger, crypto: CryptoOpts, randomBytes: (size: number) => Uint8Array) {
  const logger = ensureLogger(ilogger, "makeCodec");
  const enc32 = (value: number) => {
    value = +value;
    const buff = new Uint8Array(4);
    buff[3] = value >>> 24;
    buff[2] = value >>> 16;
    buff[1] = value >>> 8;
    buff[0] = value & 0xff;
    return buff;
  };

  const readUInt32LE = (buffer: Uint8Array) => {
    const offset = buffer.byteLength - 4;
    return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)) + buffer[offset + 3] * 0x1000000;
  };

  const concat = (buffers: (ArrayBuffer | Uint8Array)[]) => {
    const uint8Arrays = buffers.map((b) => (b instanceof ArrayBuffer ? new Uint8Array(b) : b));
    const totalLength = uint8Arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const arr of uint8Arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  };

  const encode = ({ iv, bytes }: { iv: Uint8Array; bytes: Uint8Array }) => concat([iv, bytes]);
  const decode = (bytes: Uint8Array) => {
    const iv = bytes.subarray(0, 12);
    bytes = bytes.slice(12);
    return { iv, bytes };
  };

  const code = 0x300000 + 1337;

  async function subtleKey(key: ArrayBuffer) {
    return await crypto.importKey(
      "raw", // raw or jwk
      key, // raw data
      "AES-GCM",
      false, // extractable
      ["encrypt", "decrypt"],
    );
  }

  const decrypt = async ({ key, value }: DecryptOpts): Promise<{ cid: AnyLink; bytes: Uint8Array }> => {
    const { bytes: inBytes, iv } = value;
    const cryKey = await subtleKey(key);
    const deBytes = await crypto.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
      },
      cryKey,
      inBytes,
    );
    const bytes = new Uint8Array(deBytes);
    const len = readUInt32LE(bytes.subarray(0, 4));
    const cid = CID.decode(bytes.subarray(4, 4 + len));
    return { cid, bytes: bytes.subarray(4 + len) };
  };
  const encrypt = async ({ key, cid, bytes }: EncryptOpts) => {
    const len = enc32(cid.bytes.byteLength);
    const iv = randomBytes(12);
    const msg = concat([len, cid.bytes, bytes]);
    try {
      const cryKey = await subtleKey(key);
      const deBytes = await crypto.encrypt(
        {
          name: "AES-GCM",
          iv,
          tagLength: 128,
        },
        cryKey,
        msg,
      );
      bytes = new Uint8Array(deBytes);
    } catch (e) {
      throw logger.Error().Err(e).Msg("encrypt failed").AsError();
    }
    return { value: { bytes, iv } };
  };

  const cryptoFn = (key: Uint8Array) => {
    return { encrypt: (opts: EncryptOpts) => encrypt({ ...opts, key }), decrypt: (opts: DecryptOpts) => decrypt({ ...opts, key }) };
  };

  const name = "jchris@encrypted-block:aes-gcm";

  return { encode, decode, code, name, encrypt, decrypt, crypto: cryptoFn };
}
