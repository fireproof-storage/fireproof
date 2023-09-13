// const crypto = new Crypto()

export function getCrypto() {
  try {
    if (window.crypto && window.crypto.subtle) {
      return window.crypto
    } else {
      return new Crypto()
    }
  } catch (e) {
    return null
  }
}
export const crypto = getCrypto()

export function randomBytes(size: number) {
  const bytes = new Uint8Array(size)
  if (size > 0) {
    crypto!.getRandomValues(bytes)
  }
  return bytes
}
