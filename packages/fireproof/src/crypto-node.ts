import { Crypto } from '@peculiar/webcrypto'

console.log('crypto-node.ts')

export function getCrypto() {
  try {
    if (window.crypto && window.crypto.subtle) {
      return window.crypto
    } else {
      // todo shrink the size of this import
      // we use subtle.importKey, encrypt, decrypt
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
