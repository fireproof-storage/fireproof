import type { ArrayBufferView, ByteView } from "multiformats";

/**
 * IPLD encoder part of the codec.
 */
export interface BlockEncoder<Code extends number, T> {
  name: string;
  code: Code;
  encode(data: T): ByteView<T> | PromiseLike<ByteView<T>>;
}

/**
 * IPLD decoder part of the codec.
 */
export interface BlockDecoder<Code extends number, T> {
  code: Code;
  decode(bytes: ByteView<T> | ArrayBufferView<T>): T | PromiseLike<T>;
}

/**
 * An IPLD codec is a combination of both encoder and decoder.
 */
export interface BlockCodec<Code extends number, T> extends BlockEncoder<Code, T>, BlockDecoder<Code, T> {}

export type { ArrayBufferView, ByteView };
