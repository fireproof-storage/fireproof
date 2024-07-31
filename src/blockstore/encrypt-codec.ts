// import { BlockCodec  } from "multiformats";
// import type { CryptoRuntime, IvAndBytes } from "./types.js";
// import { ensureLogger } from "../utils.js";
// import { Logger } from "@adviser/cement";




// eslint-disable-next-line @typescript-eslint/no-unused-vars
// export function makeCodec(ilogger: Logger, crypto: CryptoRuntime): BlockCodec<0x300539, IvAndBytes> {
  // return new Codec();


  // const toAnyBlock = (deBytes: ArrayBuffer):AnyBlock => {
  //   const bytes = new Uint8Array(deBytes);
  //   const len = readUInt32LE(bytes.subarray(0, 4));
  //   const cid = CID.decode(bytes.subarray(4, 4 + len));
  //   return { cid, bytes: bytes.subarray(4 + len) };
  // }

  // const decrypt = async ({ key, value }: DecryptOpts): Promise<{ cid: AnyLink; bytes: Uint8Array }> => {
  //   const { bytes: inBytes, iv } = value;
  //   const cryKey = await subtleKey(key);
  //   const deBytes = await crypto.decrypt(
  //     {
  //       name: "AES-GCM",
  //       iv,
  //       tagLength: 128,
  //     },
  //     cryKey,
  //     inBytes,
  //   );
  //   return toAnyBlock(deBytes);
  // };


  // const encrypt = async ({ key, cid, bytes }: EncryptOpts) => {
  //   const len = enc32(cid.bytes.byteLength);
  //   const iv = randomBytes(12);
  //   const msg = concat([len, cid.bytes, bytes]);
  //   try {
  //     const cryKey = await subtleKey(key);
  //     const deBytes = await crypto.encrypt(
  //       {
  //         name: "AES-GCM",
  //         iv,
  //         tagLength: 128,
  //       },
  //       cryKey,
  //       msg,
  //     );
  //     bytes = new Uint8Array(deBytes);
  //   } catch (e) {
  //     throw logger.Error().Err(e).Msg("encrypt failed").AsError();
  //   }
  //   return { value: { bytes, iv } };
  // };

  // const cryptoFn = (key: Uint8Array) => {
  //   return { encrypt: (opts: EncryptOpts) => encrypt({ ...opts, key }), decrypt: (opts: DecryptOpts) => decrypt({ ...opts, key }) };
  // };

  // const name = "Fireproof@encrypted-block:aes-gcm";
  // return { encode, decode , code, name, /* encrypt, */
  //  /* decrypt, toAnyBlock, */
    /* crypto: cryptoFn  }; */
// }
