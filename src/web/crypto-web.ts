export function getCrypto() {
  try {
    if (crypto && crypto.subtle) {
      return crypto;
    } else {
      return new Crypto();
    }
  } catch (e) {
    return null;
  }
}
const gotCrypto = getCrypto();

export { gotCrypto as crypto };

export function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  if (size > 0) {
    crypto.getRandomValues(bytes);
  }
  return bytes;
}
