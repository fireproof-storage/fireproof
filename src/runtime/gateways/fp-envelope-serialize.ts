import { exception2Result, Result, URI } from "@adviser/cement";
import type { CarClockLink, DbMeta, DbMetaBinary, DbMetaEvent, WALState } from "../../blockstore/index.js";
import {
  FPEnvelope,
  FPEnvelopeCar,
  FPEnvelopeFile,
  FPEnvelopeMeta,
  FPEnvelopeType,
  FPEnvelopeWAL,
} from "../../blockstore/fp-envelope.js";
import { PARAM, PromiseToUInt8, SuperThis } from "../../types.js";
import { decodeEventBlock, EventBlock } from "@web3-storage/pail/clock";
import { base64pad } from "multiformats/bases/base64";
import { CID, Link } from "multiformats";
import { fromJSON } from "multiformats/link";
import { format, parse } from "@ipld/dag-json";
import { EventView } from "@web3-storage/pail/clock/api";
import { coercePromiseIntoUint8 } from "../../utils.js";

export interface SerializedMeta {
  readonly data: string; // base64pad encoded
  readonly parents: string[];
  readonly cid: string;
}

export async function dbMetaEvent2Serialized(
  sthis: SuperThis,
  dbEvents: Omit<DbMetaEvent, "eventCid">[],
): Promise<SerializedMeta[]> {
  return await Promise.all(
    dbEvents.map(async (dbEvent) => {
      const event = await EventBlock.create<DbMetaBinary>(
        {
          dbMeta: sthis.txt.encode(format(dbEvent.dbMeta)),
        },
        dbEvent.parents as unknown as Link<EventView<DbMetaBinary>, number, number, 1>[],
      );
      return {
        cid: event.cid.toString(),
        parents: dbEvent.parents.map((i) => i.toString()),
        data: base64pad.encode(event.bytes),
      } satisfies SerializedMeta;
    }),
  );
}

function WALState2Serialized(sthis: SuperThis, wal: WALState): SerializedWAL {
  const serializedWAL: SerializedWAL = {
    fileOperations: wal.fileOperations.map((fop) => ({
      cid: fop.cid.toString(),
      public: fop.public,
    })),
    noLoaderOps: wal.noLoaderOps.map((nop) => ({
      cars: nop.cars.map((i) => i.toString()),
    })),
    operations: wal.operations.map((op) => ({
      cars: op.cars.map((i) => i.toString()),
    })),
  };
  return serializedWAL;
}

export type CAREncodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
export type FILEEncodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
export type METAEncodeEnvelope = (sthis: SuperThis, payload: SerializedMeta[]) => Promise<Result<Uint8Array>>;
export type WALEncodeEnvelope = (sthis: SuperThis, payload: SerializedWAL) => Promise<Result<Uint8Array>>;

// export type CAREncodeEnvelope = (sthis: SuperThis, payload: Uint8Array, base: CAREncodeEnvelopeBase) => Promise<Uint8Array>;
// export type FILEEncodeEnvelope = (sthis: SuperThis, payload: Uint8Array, base: CAREncodeEnvelopeBase) => Promise<Uint8Array>;
// export type METAEncodeEnvelope = (sthis: SuperThis, payload: SerializedMeta[], base: METAEncodeEnvelopeBase) => Promise<Uint8Array>;
// export type WALEncodeEnvelope = (sthis: SuperThis, payload: SerializedWAL, base: WALEncodeEnvelopeBase) => Promise<Uint8Array>;
export interface FPEncoder {
  readonly car: CAREncodeEnvelope;
  readonly file: FILEEncodeEnvelope;
  readonly meta: METAEncodeEnvelope;
  readonly wal: WALEncodeEnvelope;
}

const defaultEncoder: FPEncoder = {
  car: async (sthis: SuperThis, payload: Uint8Array) => Result.Ok(payload),
  file: async (sthis: SuperThis, payload: Uint8Array) => Result.Ok(payload),
  meta: async (sthis: SuperThis, payload: SerializedMeta[]) => Result.Ok(sthis.txt.encode(JSON.stringify(payload))),
  wal: async (sthis: SuperThis, payload: SerializedWAL) => Result.Ok(sthis.txt.encode(JSON.stringify(payload))),
};

export async function fpSerialize<T>(
  sthis: SuperThis,
  env: FPEnvelope<T>,
  pencoder?: Partial<FPEncoder>,
): Promise<Result<Uint8Array>> {
  const encoder = {
    ...defaultEncoder,
    ...pencoder,
  };
  switch (env.type) {
    case FPEnvelopeType.FILE:
      return encoder.file(sthis, (env as FPEnvelopeFile).payload);
    case FPEnvelopeType.CAR:
      return encoder.car(sthis, (env as FPEnvelopeCar).payload);
    case FPEnvelopeType.WAL:
      return encoder.wal(sthis, WALState2Serialized(sthis, (env as FPEnvelopeWAL).payload));
    case FPEnvelopeType.META:
      return encoder.meta(sthis, await dbMetaEvent2Serialized(sthis, (env as FPEnvelopeMeta).payload));
    default:
      throw sthis.logger.Error().Str("type", env.type).Msg("unsupported store").AsError();
  }
}

export async function decode2DbMetaEvents(
  sthis: SuperThis,
  rserializedMeta: Result<SerializedMeta[]>,
): Promise<Result<DbMetaEvent[]>> {
  if (rserializedMeta.isErr()) {
    return Result.Err(rserializedMeta.Err());
  }
  const serializedMeta = rserializedMeta.unwrap();
  if (!Array.isArray(serializedMeta)) {
    return sthis.logger.Debug().Any("metaEntries", serializedMeta).Msg("No data in MetaEntries").ResultError();
  }
  if (!serializedMeta.length) {
    return sthis.logger.Debug().Msg("No MetaEntries found").ResultError();
  }
  return Result.Ok(
    await Promise.all(
      serializedMeta.map(async (metaEntry) => {
        const eventBlock = await decodeEventBlock<DbMetaBinary>(base64pad.decode(metaEntry.data));
        const dbMeta = parse<DbMeta>(sthis.txt.decode(eventBlock.value.data.dbMeta));
        return {
          eventCid: eventBlock.cid as CarClockLink,
          parents: metaEntry.parents.map((i: string) => CID.parse(i)),
          dbMeta,
        } satisfies DbMetaEvent;
      }),
    ),
  );
}

type linkOrCid = { "/": string } | string;

export interface SerializedWAL {
  readonly fileOperations?: { cid: linkOrCid; public: boolean }[];
  readonly noLoaderOps?: { cars: linkOrCid[] }[];
  readonly operations?: { cars: linkOrCid[] }[];
}

function toCid(sthis: SuperThis, link: linkOrCid): CID {
  if (typeof link === "string") {
    return CID.parse(link);
  }
  return fromJSON(link);
}

async function decode2WalState(sthis: SuperThis, rserializedWAL: Result<SerializedWAL>): Promise<Result<WALState>> {
  if (rserializedWAL.isErr()) {
    return Result.Err(rserializedWAL.Err());
  }
  const serializedWAL = rserializedWAL.unwrap();
  return Result.Ok({
    fileOperations: (serializedWAL.fileOperations || []).map((fop) => ({
      cid: toCid(sthis, fop.cid),
      public: !!fop.public,
    })),
    noLoaderOps: (serializedWAL.noLoaderOps || []).map((nop) => ({
      cars: (nop.cars || []).map((i) => toCid(sthis, i)),
    })),
    operations: (serializedWAL.operations || []).map((op) => ({
      cars: (op.cars || []).map((i) => toCid(sthis, i)),
    })),
  });
}
// export type CARDecodeEnvelopeBase = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
// export type FILEDecodeEnvelopeBase = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
// export type WALDecodeEnvelopeBase = (sthis: SuperThis, payload: SerializedWAL) => Promise<Result<SerializedWAL>>;
// export type METADecodeEnvelopeBase = (sthis: SuperThis, payload: SerializedMeta[]) => Promise<Result<SerializedMeta[]>>;

export type CARDecodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
export type FILEDecodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<Uint8Array>>;
export type METADecodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<SerializedMeta[]>>;
export type WALDecodeEnvelope = (sthis: SuperThis, payload: Uint8Array) => Promise<Result<SerializedWAL>>;
export interface FPDecoder {
  readonly car: CARDecodeEnvelope;
  readonly file: FILEDecodeEnvelope;
  readonly meta: METADecodeEnvelope;
  readonly wal: WALDecodeEnvelope;
}

const defaultDecoder = {
  car: async (sthis: SuperThis, payload: Uint8Array) => Result.Ok(payload),
  file: async (sthis: SuperThis, payload: Uint8Array) => Result.Ok(payload),
  meta: async (sthis: SuperThis, payload: Uint8Array) =>
    exception2Result(() => JSON.parse(sthis.txt.decode(payload)) as SerializedMeta[]),
  wal: async (sthis: SuperThis, payload: Uint8Array) =>
    exception2Result(() => JSON.parse(sthis.txt.decode(payload)) as SerializedWAL),
};

function makeFPEnvelope<S>(type: FPEnvelopeType, payload: Result<S>): Result<FPEnvelope<S>> {
  if (payload.isErr()) {
    return Result.Err(payload.Err());
  }
  return Result.Ok({
    type,
    payload: payload.unwrap(),
  });
}

export async function fpDeserialize<S>(
  sthis: SuperThis,
  url: URI,
  intoRaw: PromiseToUInt8,
  pdecoder?: Partial<FPDecoder>,
): Promise<Result<FPEnvelope<S>>> {
  const rraw = await coercePromiseIntoUint8(intoRaw);
  if (rraw.isErr()) {
    return Result.Err(rraw.Err());
  }
  const raw = rraw.unwrap();
  const decoder = {
    ...defaultDecoder,
    ...pdecoder,
  };
  switch (url.getParam(PARAM.STORE)) {
    case "data":
      if (url.getParam(PARAM.SUFFIX) === ".car") {
        return makeFPEnvelope(FPEnvelopeType.CAR, await decoder.car(sthis, raw)) as Result<FPEnvelope<S>>;
      }
      return makeFPEnvelope(FPEnvelopeType.FILE, await decoder.file(sthis, raw)) as Result<FPEnvelope<S>>;
    case "wal":
      return makeFPEnvelope(FPEnvelopeType.WAL, await decode2WalState(sthis, await decoder.wal(sthis, raw))) as Result<
        FPEnvelope<S>
      >;
    case "meta":
      return makeFPEnvelope(FPEnvelopeType.META, await decode2DbMetaEvents(sthis, await decoder.meta(sthis, raw))) as Result<
        FPEnvelope<S>
      >;
    default:
      return sthis.logger.Error().Str("store", url.getParam(PARAM.STORE)).Msg("unsupported store").ResultError();
  }
}
