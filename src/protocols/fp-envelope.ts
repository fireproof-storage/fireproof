import { FPCarReq, FPCarRes } from "./fp-car.js";
import { FPFileReq, FPFileRes } from "./fp-file.js";
import { FPMetaReq, FPMetaRes } from "./fp-meta.js";
import { FPWALReq, FPWALRes } from "./fp-wal.js";

export enum FPStoreType {
  CAR = "car",
  FILE = "file",
  META = "meta",
  WAL = "wal",
}

export enum FPEnvelopeType {
  // CAR = "car",
  // FILE = "file",
  // META = "meta",
  // WAL = "wal",

  FORMAT_NEG_REQ = "format-nego-req",
  FORMAT_NEG_RES = "format-nego-res",

  GET_CARREQ = "get-car-req",
  GET_CARRES = "get-car-res",
  GET_FILEREQ = "get-file-req",
  GET_FILERES = "get-file-res",
  GET_METAREQ = "get-meta-req",
  GET_METARES = "get-meta-res",
  GET_WALREQ = "get-wal-req",
  GET_WALRES = "get-wal-res",

  PUT_CARREQ = "put-car-req",
  PUT_CARRES = "put-car-res",
  PUT_FILEREQ = "put-file-req",
  PUT_FILERES = "put-file-res",
  PUT_METAREQ = "put-meta-req",
  PUT_METARES = "put-meta-res",
  PUT_WALREQ = "put-wal-req",
  PUT_WALRES = "put-wal-res",

  DEL_CARREQ = "del-car-req",
  DEL_CARRES = "del-car-res",
  DEL_FILEREQ = "del-file-req",
  DEL_FILERES = "del-file-res",
  DEL_METAREQ = "del-meta-req",
  DEL_METARES = "del-meta-res",
  DEL_WALREQ = "del-wal-req",
  DEL_WALRES = "del-wal-res",

}

export interface FPAuth {
  readonly type: "none" | "token";
}

export interface FPAuthNone extends FPAuth {
  readonly type: "none";
}

export interface FPAuthToken extends FPAuth {
  readonly type: "token";
  readonly token: string;
}

export interface FPEnvelope<T> {
  readonly type: FPEnvelopeType;
  readonly storeType: FPStoreType;
  readonly payload: T;
}

export type FPEnvelopeReq<T> = FPCarReq<T> | FPFileReq<T> | FPMetaReq<T> | FPWALReq<T>;
export type FPEnvelopeRes<T> = FPCarRes<T> | FPFileRes<T> | FPMetaRes<T> | FPWALRes<T>;

export interface FPError {
  readonly code: "NOT_FOUND" | "INTERNAL";
  readonly message: string;
  readonly stack?: string[];
}

export interface FPLog {
  readonly level: ("debug" | "info" | "warn" | "error")[];
  readonly module: string[];
  readonly messages: string[];
}

export interface FPEnvelopeTurnaround<T> extends FPEnvelope<T> {
  readonly tid: string;
  readonly error?: FPError;
  readonly log?: FPLog;
  readonly annotation?: Record<string, string|string[]>;
}

export interface FPAuthEnvelope<T> extends FPEnvelopeTurnaround<T> {
  readonly auth?: FPAuth;
}

export enum FPMIMEFormat {
  JSON = "application/json",
  CBOR = "application/cbor",
}

// this message is always request in P in JSON format
export interface FPEnvelopeOptionReq extends FPEnvelopeTurnaround<Record<string, unknown>> {
  readonly type: FPEnvelopeType.FORMAT_NEG_REQ
  readonly acceptFormat: FPMIMEFormat
  readonly version?: string // version of client-implementation
  readonly annotation?: Record<string, string|string[]>
}

// this message is always responded in JSON format
export interface FPEnvelopeOptionRes extends FPEnvelopeTurnaround<Record<string, unknown>> {
  readonly type: FPEnvelopeType.FORMAT_NEG_RES
  readonly contentFormat: FPMIMEFormat
  readonly version: string // version of server-implementation
  readonly annotation?: Record<string, string|string[]>
}

// The FPAuthEnvelope is the base for all wireprotocol messages
// if the wireprotocol is used over http this messages should be send
// in the wireFormat which had been negotiated before with the
// FPEnvelopeOptionReq and FPEnvelopeOptionRes messages
// The Accept header should be set to the acceptFormat of the requesting
// implementation and the Content-Type header should by the requested
// implementation in respect of the Accept header
// In the Content-Type/Accept header the exploded mime-types should be used
// like application/json or application/cbor
// Every Request is passed as body in the POST/PUT request
// Every Response is passed as body in the response

// export interface FPEnvelopeMeta extends FPEnvelope<DbMetaEvent[]> {
//   readonly type: FPEnvelopeType.META;
// }


// export interface FPWAL {
//     // fileOperations: any[]; will be added with connector-fixes
//     // noLoaderOps: any[]; will be added with connector-fixes
//     readonly operations: FPWALCarsOps[];
// }

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


// export function FPMsg2Car(fpmsg: Uint8Array): Result<Uint8Array> {
//     const renv = FPMsgMatch2Envelope(fpmsg, "car");
//     if (renv.isErr()) {
//         return Result.Err(renv.Err());
//     }
//     return Result.Ok(renv.Ok().payload as Uint8Array);
// }



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
