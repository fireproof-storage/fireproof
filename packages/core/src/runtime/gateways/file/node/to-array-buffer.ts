export function toArrayBuffer(buffer: Buffer | string): Uint8Array {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer);
  }
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return view;
}
