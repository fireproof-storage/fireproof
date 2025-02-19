// this enable async codec
// it should be gone if this in multiformats is merged:
// https://github.com/multiformats/js-multiformats/pull/305
import { bytes as binary, CID, MultihashHasher, BlockView, ByteView, Version, Link, MultihashDigest } from "multiformats";
import { Block as mfBlock } from "multiformats/block";
import { AsyncBlockDecoder, AsyncBlockEncoder, BlockDecoder, BlockEncoder } from "./codec-interface.js";

// export type Block<T, C extends number, A extends number, V extends Version> = mfBlock<T, C, A, V>

export const Block = mfBlock;

export interface HashBytesGet<T> {
  get(v: T): ByteView<unknown>;
}

export interface DecodeInput<T, Code extends number, Alg extends number> {
  readonly bytes: ByteView<unknown>;
  readonly hashBytes?: HashBytesGet<T>;
  readonly codec: BlockDecoder<Code, T>;
  readonly hasher: MultihashHasher<Alg>;
}

export interface AsyncHashBytesGet<T> {
  get(v: T): Promise<ByteView<unknown>>;
}

export interface AsyncDecodeInput<T, Code extends number, Alg extends number> {
  readonly bytes: ByteView<unknown>;
  readonly hashBytes?: AsyncHashBytesGet<T>;
  readonly codec: AsyncBlockDecoder<Code, T>;
  readonly hasher: MultihashHasher<Alg>;
}

export async function decode<T, Code extends number, Alg extends number>({
  bytes,
  codec,
  hashBytes: serializer,
  hasher,
}: AsyncDecodeInput<T, Code, Alg> | DecodeInput<T, Code, Alg>): Promise<BlockView<T, Code, Alg>> {
  if (bytes == null) throw new Error('Missing required argument "bytes"');
  if (codec == null || hasher == null) throw new Error("Missing required argument: codec or hasher");

  // outer cbor
  const value = (await Promise.resolve(codec.decode(bytes))) as T;
  let toHash = bytes;
  if (serializer) {
    toHash = (await Promise.resolve(serializer.get(value))) as ByteView<unknown>;
  }
  const hash = await hasher.digest(toHash);
  const cid = CID.create(1, codec.code, hash) as CID<T, Code, Alg, 1>;

  return new mfBlock<T, Code, Alg, 1>({ value, bytes: toHash as ByteView<T>, cid });
}

export interface AsyncHashBytesGet<T> {
  get(v: T): Promise<ByteView<unknown>>;
}

export interface HashAsBytes<T> {
  as(v: T): ByteView<unknown>;
}

export interface AsyncHashAsBytes<T> {
  as(v: T): Promise<ByteView<unknown>>;
}

export interface EncodeInput<T, Code extends number, Alg extends number> {
  readonly value: T;
  readonly codec: BlockEncoder<Code, T>;
  // if serializer is not provided, the codec is assumed to be a block encoder
  // if serializer is provided it will run in this order:
  // 1. serializer
  // 2. hasher
  // 3. codec
  readonly hashBytes?: HashAsBytes<T>;
  readonly hasher: MultihashHasher<Alg>;
}

export interface AsyncEncodeInput<T, Code extends number, Alg extends number> {
  readonly value: T;
  readonly codec: AsyncBlockEncoder<Code, T>;
  // if serializer is not provided, the codec is assumed to be a block encoder
  // if serializer is provided it will run in this order:
  // 1. serializer
  // 2. hasher
  // 3. codec
  readonly hashBytes?: AsyncHashAsBytes<T>;
  readonly hasher: MultihashHasher<Alg>;
}

/**
 * @template T - Logical type of the data encoded in the block
 * @template Code - multicodec code corresponding to codec used to encode the block
 * @template Alg - multicodec code corresponding to the hashing algorithm used in CID creation.
 */
export async function encode<T, Code extends number, Alg extends number>({
  value,
  codec,
  hasher,
  hashBytes,
}: AsyncEncodeInput<T, Code, Alg> | EncodeInput<T, Code, Alg>): Promise<BlockView<T, Code, Alg>> {
  if (typeof value === "undefined") throw new Error('Missing required argument "value"');
  if (codec == null || hasher == null) throw new Error("Missing required argument: codec or hasher");

  let bytes: ByteView<T>;
  let hash: MultihashDigest;
  if (hashBytes) {
    const hashable = await Promise.resolve(hashBytes.as(value));
    hash = await hasher.digest(hashable);
    bytes = await Promise.resolve(codec.encode(value as T));
  } else {
    bytes = await Promise.resolve(codec.encode(value));
    hash = await hasher.digest(bytes);
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const cid = CID.create(1, codec.code, hash) as CID<T, Code, Alg, 1>;

  return new Block({ value, bytes, cid });
}

interface CreateInput<T, Code extends number, Alg extends number, V extends Version> {
  bytes: ByteView<T>;
  cid: Link<T, Code, Alg, V>;
  hasher: MultihashHasher<Alg>;
  codec: BlockDecoder<Code, T>;
}

export async function create<T, Code extends number, Alg extends number, V extends Version>({
  bytes,
  cid,
  hasher,
  codec,
}: CreateInput<T, Code, Alg, V>): Promise<BlockView<T, Code, Alg, V>> {
  if (bytes == null) throw new Error('Missing required argument "bytes"');
  if (hasher == null) throw new Error('Missing required argument "hasher"');
  const value = await Promise.resolve(codec.decode(bytes));
  const hash = await hasher.digest(bytes);
  if (!binary.equals(cid.multihash.bytes, hash.bytes)) {
    throw new Error("CID hash does not match bytes");
  }

  return createUnsafe({
    bytes,
    cid,
    value,
    codec,
  });
}

type CreateUnsafeInput<T, Code extends number, Alg extends number, V extends Version> =
  | {
      cid: Link<T, Code, Alg, V>;
      value: T;
      codec?: BlockDecoder<Code, T>;
      bytes: ByteView<T>;
    }
  | {
      cid: Link<T, Code, Alg, V>;
      value?: undefined;
      codec: BlockDecoder<Code, T>;
      bytes: ByteView<T>;
    };

/**
 * @template T - Logical type of the data encoded in the block
 * @template Code - multicodec code corresponding to codec used to encode the block
 * @template Alg - multicodec code corresponding to the hashing algorithm used in CID creation.
 * @template V - CID version
 */
export async function createUnsafe<T, Code extends number, Alg extends number, V extends Version>({
  bytes,
  cid,
  value: maybeValue,
  codec,
}: CreateUnsafeInput<T, Code, Alg, V>): Promise<BlockView<T, Code, Alg, V>> {
  const value = await Promise.resolve(maybeValue !== undefined ? maybeValue : codec?.decode(bytes));

  if (value === undefined) throw new Error('Missing required argument, must either provide "value" or "codec"');

  return new Block({
    cid: cid as CID<T, Code, Alg, V>,
    bytes,
    value,
  });
}
