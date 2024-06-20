import { Crypto } from "@peculiar/webcrypto";
import { throwFalsy } from "../types";

export function getCrypto() {
  try {
    return new Crypto();
  } catch (e) {
    return undefined;
  }
}
export const crypto = throwFalsy(getCrypto());

export function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  if (size > 0) {
    crypto.getRandomValues(bytes);
  }
  return bytes;
}
