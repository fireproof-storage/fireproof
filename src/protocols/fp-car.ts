// import { Result } from "@adviser/cement";
import { FPEnvelopeTurnaround, FPEnvelopeType, FPStoreType } from "./fp-envelope";
import { CID } from "multiformats";

export interface FPGetCarReq {
    readonly cid: CID;
}
/*
 * A request to get a CAR file.
 * As JSON, this is:
 * {
 *    "type": "get-car-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetCarReq extends FPCarReq<FPGetCarReq> {
    readonly type: FPEnvelopeType.GET_CARREQ;
    readonly storeType: FPStoreType.CAR;
}

export interface FPGetCarRes {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
/*
 * The response to a GetCar request.
 * As JSON, this is:
 * {
 *    "type": "get-car-res",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetCarRes extends FPCarRes<FPGetCarRes> {
    readonly type: FPEnvelopeType.GET_CARRES;
    readonly storeType: FPStoreType.CAR;
}

export interface FPPutCarReq {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
/*
 * A request to get a CAR file.
 * As JSON, this is:
 * {
 *    "type": "put-car-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopePutCarReq extends FPCarReq<FPPutCarReq> {
    readonly type: FPEnvelopeType.PUT_CARREQ;
    readonly storeType: FPStoreType.CAR;
}

export interface FPDelCarReq {
    readonly cid: CID;
}
/*
 * The response to a PutCar request.
 * As JSON, this is:
 * {
 *    "type": "del-car-res",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "meta": {
 *           "key1": "value1",
 *       }
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeDelCarReq extends FPCarReq<FPDelCarReq> {
    readonly type: FPEnvelopeType.DEL_CARREQ;
    readonly storeType: FPStoreType.CAR;
}


export interface FPDelCarRes {
    readonly cid: CID;
    // optional deleted bytes
    readonly bytes?: Uint8Array;
}
/*
 * A request to get a CAR file.
 * As JSON, this is:
 * {
 *    "type": "get-car-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeDelCarRes extends FPCarRes<FPDelCarRes> {
    readonly type: FPEnvelopeType.DEL_CARRES;
    readonly storeType: FPStoreType.CAR;
}

export interface FPCarReq<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_CARREQ | FPEnvelopeType.GET_CARREQ | FPEnvelopeType.PUT_CARREQ;
    readonly storeType: FPStoreType.CAR;
  }

  export interface FPCarRes<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_CARRES | FPEnvelopeType.GET_CARRES | FPEnvelopeType.PUT_CARRES;
    readonly storeType: FPStoreType.CAR;
  }

// export interface FPEnvelopeCar extends FPEnvelope<Uint8Array> {
//     readonly type: FPEnvelopeType.CAR;
// }

// export function Car2FPMsg(fpcar: Uint8Array): Result<FPEnvelopeCar> {
//     return Result.Ok({ type: FPEnvelopeType.CAR, payload: fpcar });
// }
