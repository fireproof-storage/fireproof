import { Result, URI } from "@adviser/cement";
import {
  CarClockLink,
  DbMeta,
  DbMetaBinary,
  DbMetaEvent,
  FPEnvelope,
  FPEnvelopeCar,
  FPEnvelopeFile,
  FPEnvelopeMeta,
  FPEnvelopeWAL,
  WALState,
} from "../../blockstore";
import { PARAM, SuperThis } from "../../types";
import { decodeEventBlock, EventBlock } from "@web3-storage/pail/clock";
import { base64pad } from "multiformats/bases/base64";
import { CID, Link } from "multiformats";
import { fromJSON } from "multiformats/link";
import { format, parse } from "@ipld/dag-json";
import { EventView } from "@web3-storage/pail/src/clock/api";

interface SerializedMeta {
  readonly data: string; // base64pad encoded
  readonly parents: string[];
  readonly cid: string;
}

async function dbMetaEvent2uint8(sthis: SuperThis, dbEvents: Omit<DbMetaEvent, "eventCid">[]): Promise<Uint8Array> {
  const json: SerializedMeta[] = await Promise.all(
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
      } as SerializedMeta;
    }),
  );
  return sthis.txt.encode(JSON.stringify(json));
}

function WALState2uint8(sthis: SuperThis, wal: WALState): Uint8Array {
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
  return sthis.txt.encode(JSON.stringify(serializedWAL));
}

export async function fpSerialize<T>(sthis: SuperThis, env: FPEnvelope<T>, url: URI): Promise<Uint8Array> {
  switch (url.getParam(PARAM.STORE)) {
    case "data":
      return (env as FPEnvelopeCar).payload;
    case "wal":
      return WALState2uint8(sthis, (env as FPEnvelopeWAL).payload);
    case "meta":
      return dbMetaEvent2uint8(sthis, (env as FPEnvelopeMeta).payload);
    default:
      throw sthis.logger.Error().Str("store", url.getParam(PARAM.STORE)).Msg("unsupported store").AsError();
  }
}

async function decode2DbMetaEvents(sthis: SuperThis, raw: Uint8Array): Promise<DbMetaEvent[]> {
  const serializedMeta = JSON.parse(sthis.txt.decode(raw)) as SerializedMeta[];
  if (!Array.isArray(serializedMeta)) {
    sthis.logger.Debug().Any("metaEntries", serializedMeta).Msg("No data in MetaEntries");
    return [];
  }
  if (!serializedMeta.length) {
    sthis.logger.Debug().Any("byteHeads", raw).Msg("No MetaEntries found");
    return [];
  }
  return Promise.all(
    serializedMeta.map(async (metaEntry) => {
      const eventBlock = await decodeEventBlock<DbMetaBinary>(base64pad.decode(metaEntry.data));
      const dbMeta = parse<DbMeta>(sthis.txt.decode(eventBlock.value.data.dbMeta));
      return {
        eventCid: eventBlock.cid as CarClockLink,
        parents: metaEntry.parents.map((i: string) => CID.parse(i)),
        dbMeta,
      } satisfies DbMetaEvent;
    }),
  );
}

type linkOrCid = { "/": string } | string;

interface SerializedWAL {
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

async function decode2WalState(sthis: SuperThis, raw: Uint8Array): Promise<WALState> {
  const serializedWAL = JSON.parse(sthis.txt.decode(raw)) as SerializedWAL;
  return {
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
  };
}

export async function fpDeserialize<S>(sthis: SuperThis, raw: Uint8Array, url: URI): Promise<Result<FPEnvelope<S>>> {
  switch (url.getParam(PARAM.STORE)) {
    case "data":
      return Result.Ok({
        type: url.getParam(PARAM.SUFFIX) ? "car" : "file",
        payload: raw,
      } satisfies FPEnvelopeFile | FPEnvelopeCar) as Result<FPEnvelope<S>>;
    case "wal":
      return Result.Ok({
        type: "wal",
        payload: await decode2WalState(sthis, raw),
      } satisfies FPEnvelopeWAL) as Result<FPEnvelope<S>>;
    case "meta":
      return Result.Ok({
        type: "meta",
        payload: await decode2DbMetaEvents(sthis, raw),
      } satisfies FPEnvelopeMeta) as Result<FPEnvelope<S>>;
    default:
      throw sthis.logger.Error().Str("store", url.getParam(PARAM.STORE)).Msg("unsupported store").AsError();
  }
}
