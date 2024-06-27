import { CryptoOpts } from "../storage-engine/index.js";

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  if (size > 0) {
    crypto.getRandomValues(bytes);
  }
  return bytes;
}

function digestSHA256(data: Uint8Array): Promise<ArrayBuffer> {
  return Promise.resolve(crypto.subtle.digest("SHA-256", data));
}

export function toCryptoOpts(cryptoOpts: Partial<CryptoOpts> = {}): CryptoOpts {
  const opts = {
    importKey: cryptoOpts.importKey || crypto.subtle.importKey.bind(crypto.subtle),
    encrypt: cryptoOpts.encrypt || crypto.subtle.encrypt.bind(crypto.subtle),
    decrypt: cryptoOpts.decrypt || crypto.subtle.decrypt.bind(crypto.subtle),
    randomBytes: cryptoOpts.randomBytes || randomBytes,
    digestSHA256: cryptoOpts.digestSHA256 || digestSHA256,
  };
  // console.log("cryptoOpts", cryptoOpts, opts)
  return opts;
}
