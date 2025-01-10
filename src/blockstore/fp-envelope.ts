import { CID } from "multiformats";
import { DbMetaEvent, WALState } from "./types.js";
import { Result } from "@adviser/cement";

export enum FPEnvelopeType {
  CAR = "car",
  FILE = "file",
  META = "meta",
  WAL = "wal",
}

export interface FPEnvelope<T> {
  readonly type: FPEnvelopeType;
  readonly payload: T;
}

export interface FPEnvelopeCar extends FPEnvelope<Uint8Array> {
  readonly type: FPEnvelopeType.CAR;
}

export interface FPEnvelopeFile extends FPEnvelope<Uint8Array> {
  readonly type: FPEnvelopeType.FILE;
}

export interface FPEnvelopeMeta extends FPEnvelope<DbMetaEvent[]> {
  readonly type: FPEnvelopeType.META;
}

export interface FPWALCarsOps {
  readonly cars: CID[];
}
// export interface FPWAL {
//     // fileOperations: any[]; will be added with connector-fixes
//     // noLoaderOps: any[]; will be added with connector-fixes
//     readonly operations: FPWALCarsOps[];
// }
export interface FPEnvelopeWAL extends FPEnvelope<WALState> {
  readonly type: FPEnvelopeType.WAL;
}

// export function WAL2FPMsg(sthis: SuperThis, ws: WALState): Result<FPEnvelopeWAL> {
//     return Result.Ok({
//         type: "wal",
//         payload: ws
//     })
// }

// export function FPMsg2WAL(fpmsg: FPEnvelopeWAL): Result<WALState> {
//     // const renv = FPMsgMatch2Envelope(fpmsg, "wal");
//     // if (renv.isErr()) {
//     //     return Result.Err(renv.Err());
//     // }
//     if (fpmsg.type !== "wal") {
//         return Result.Err(`expected type to be wal`);
//     }
//     const convertCids = fpmsg.payload as WALState;
//     for (const op of convertCids.operations) {
//         const cars = []
//         for (const strCid of op.cars) {
//             for (const cidVal of Object.values(strCid)) {
//                 cars.push(CID.parse(cidVal));
//             }
//         }
//         (op as {cars: CID[]}).cars = cars;
//     }
//     return Result.Ok(convertCids);
// }

// export function Meta2FPMsg(fpmetas: DbMetaEvent[]): Uint8Array {
//     /*
//     [
//         {
//         "cid":"bafyreibc2rbsszqw5z7xiojra2vgskl3mi7iegf3ynpofm6w6lcxx4r7ha",
//         "data":"MomRkYXRhoWZkYk1ldGFYU3siY2FycyI6W3siLyI6ImJhZzR5dnFhYmNpcW9peXdlb2Vjd214Z3VmdDV4YmJsMnFxd2c3Z2tmYTV6cG91d2huYWVoN3E1b3o2eTNoMnkifV19Z3BhcmVudHOB2CpYJQABcRIgTXAXVfzn7tghZBnaOrXq0+bmY3kK9f1CCNrGfeA73hk=",
//         "parents":["bafyreicnoalvl7hh53mcczaz3i5ll2wt43tgg6ik6x6uecg2yz66ao66de"]
//         }
//     ]
//     */
//     return encode({ type: "meta", payload: fpmetas } as FPEnvelopeMeta);
// }

// export function FPMsg2Meta(fpmsg: Uint8Array): Result<DbMeta> {
//     const renv = FPMsgMatch2Envelope(fpmsg, "meta");
//     if (renv.isErr()) {
//         return Result.Err(renv.Err());
//     }
//     return Result.Ok(renv.Ok().payload as DbMeta);
// }

export function Car2FPMsg(fpcar: Uint8Array): Result<FPEnvelopeCar> {
  return Result.Ok({ type: FPEnvelopeType.CAR, payload: fpcar });
}

// export function FPMsg2Car(fpmsg: Uint8Array): Result<Uint8Array> {
//     const renv = FPMsgMatch2Envelope(fpmsg, "car");
//     if (renv.isErr()) {
//         return Result.Err(renv.Err());
//     }
//     return Result.Ok(renv.Ok().payload as Uint8Array);
// }

export function File2FPMsg(fpfile: Uint8Array): Result<FPEnvelopeFile> {
  return Result.Ok({ type: FPEnvelopeType.FILE, payload: fpfile });
}

// export function FPMsg2File(fpmsg: Uint8Array): Result<Uint8Array> {
//     const renv = FPMsgMatch2Envelope(fpmsg, "file");
//     if (renv.isErr()) {
//         return Result.Err(renv.Err());
//     }
//     return Result.Ok(renv.Ok().payload as Uint8Array);
// }

// export function FPMsgMatch2Envelope(fpmsg: Uint8Array, ...types: string[]): Result<FPEnvelope<unknown>> {
//     let env: FPEnvelope<unknown>;
//     try {
//         env = decode(fpmsg);
//     } catch (e) {
//         return Result.Err(`failed to decode envelope: ${e}`);
//     }
//     if (typeof env !== "object") {
//         return Result.Err(`expected envelope to be an object`);
//     }
//     if (typeof env.type !== "string") {
//         return Result.Err(`expected type to be a string`);
//     }
//     if (types.length > 0 && !types.includes(env.type)) {
//         return Result.Err(`expected type to be ${types}`);
//     }
//     // need to check if the payload is a valid WAL
//     return Result.Ok(env);
// }
