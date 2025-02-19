import type { ArrayBufferView, ByteView } from "multiformats";

/**
 * IPLD encoder part of the codec.
 */
export interface BlockEncoder<Code extends number, T> {
  readonly name: string;
  readonly code: Code;
  // encode(data: T): ByteView<T>;
  // encode(data: T): PromiseLike<ByteView<T>>;
  encode(data: T): ByteView<T>;
}

export interface AsyncBlockEncoder<Code extends number, T> {
  readonly name: string;
  readonly code: Code;
  // encode(data: T): ByteView<T>;
  // encode(data: T): PromiseLike<ByteView<T>>;
  encode(data: T): PromiseLike<ByteView<T>>;
}

/**
 * IPLD decoder part of the codec.
 */
export interface BlockDecoder<Code extends number, T> {
  readonly code: Code;
  // decode(bytes: ByteView<T> | ArrayBufferView<T>): T;
  // decode(bytes: ByteView<T> | ArrayBufferView<T>): PromiseLike<T>;
  decode(bytes: ByteView<unknown>): T;
}

export interface AsyncBlockDecoder<Code extends number, T> {
  readonly code: Code;
  // decode(bytes: ByteView<T> | ArrayBufferView<T>): T;
  // decode(bytes: ByteView<T> | ArrayBufferView<T>): PromiseLike<T>;
  decode(bytes: ByteView<unknown>): PromiseLike<T>;
}

/**
 * An IPLD codec is a combination of both encoder and decoder.
 */
export interface BlockCodec<Code extends number, E, D> extends BlockEncoder<Code, E>, BlockDecoder<Code, D> {}
export interface AsyncBlockCodec<Code extends number, E, D> extends AsyncBlockEncoder<Code, E>, AsyncBlockDecoder<Code, D> {}

export type { ArrayBufferView, ByteView };
