// this enable async codec
// it should be gone if this in multiformats is merged:
// https://github.com/multiformats/js-multiformats/pull/305
import { bytes as binary, CID, MultihashHasher, BlockView, ByteView, Version, Link } from "multiformats";
import { Block as mfBlock } from "multiformats/block";
import { BlockDecoder, BlockEncoder } from "./codec-interface.js";

// export type Block<T, C extends number, A extends number, V extends Version> = mfBlock<T, C, A, V>

export const Block = mfBlock;

interface DecodeInput<T, Code extends number, Alg extends number> {
  readonly bytes: ByteView<T>;
  readonly codec: BlockDecoder<Code, T>;
  readonly hasher: MultihashHasher<Alg>;
}

export async function decode<T, Code extends number, Alg extends number, V extends Version = 1>({
  bytes,
  codec,
  hasher,
}: DecodeInput<T, Code, Alg>): Promise<BlockView<T, Code, Alg, V>> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!bytes) throw new Error('Missing required argument "bytes"');
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!codec || !hasher) throw new Error("Missing required argument: codec or hasher");

  const value = await Promise.resolve(codec.decode(bytes));
  const hash = await hasher.digest(bytes);
  const cid = CID.create(1 as V, codec.code, hash);

  return new mfBlock<T, Code, Alg, V>({ value, bytes, cid });
}

interface EncodeInput<T, Code extends number, Alg extends number> {
  readonly value: T;
  readonly codec: BlockEncoder<Code, T>;
  readonly hasher: MultihashHasher<Alg>;
}

export async function encode<T, Code extends number, Alg extends number, V extends Version = 1>({
  value,
  codec,
  hasher,
}: EncodeInput<T, Code, Alg>): Promise<BlockView<T, Code, Alg, V>> {
  if (typeof value === "undefined") throw new Error('Missing required argument "value"');
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!codec || !hasher) throw new Error("Missing required argument: codec or hasher");

  const bytes = await Promise.resolve(codec.encode(value));
  const hash = await hasher.digest(bytes);
  const cid = CID.create(1 as V, codec.code, hash);

  return new mfBlock<T, Code, Alg, V>({ value, bytes, cid });
}

interface CreateInput<T, Code extends number, Alg extends number, V extends Version> {
  readonly bytes: ByteView<T>;
  readonly cid: Link<T, Code, Alg, V>;
  readonly hasher: MultihashHasher<Alg>;
  readonly codec: BlockDecoder<Code, T>;
}

export async function create<T, Code extends number, Alg extends number, V extends Version>({
  bytes,
  cid,
  hasher,
  codec,
}: CreateInput<T, Code, Alg, V>): Promise<BlockView<T, Code, Alg, V>> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!bytes) throw new Error('Missing required argument "bytes"');
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!hasher) throw new Error('Missing required argument "hasher"');
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
  const value = await Promise.resolve(maybeValue ? maybeValue : codec?.decode(bytes));

  if (value === undefined) throw new Error('Missing required argument, must either provide "value" or "codec"');

  return new Block({
    cid: cid as CID<T, Code, Alg, V>,
    bytes,
    value,
  });
}
