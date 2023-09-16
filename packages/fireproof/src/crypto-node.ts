import { Crypto } from '@peculiar/webcrypto'

export function getCrypto() {
  try {
    return new Crypto()
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
