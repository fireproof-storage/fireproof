import { FPEnvelopeTurnaround, FPEnvelopeType, FPStoreType } from "./fp-envelope.js";
import { CID } from "multiformats";
import { WALState } from "../blockstore/types.js";

export type FPGetWALReq = WALState
/*
 * A request to get a WAL file.
 * As JSON, this is:
 * {
 *    "type": "get-wal-req",
 *    "tid": "123",
 *    "payload": {
 *   operations: DbMeta[];
  noLoaderOps: DbMeta[];
  fileOperations: {
    cid: AnyLink;
    readonly public: boolean;
  }[];
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetWALReq extends FPWALReq<FPGetWALReq> {
    readonly type: FPEnvelopeType.GET_WALREQ;
    readonly storeType: FPStoreType.WAL;
}

export interface FPGetWALRes {
    readonly aid: string; // action id
}
/*
 * The response to a GetWAL request.
 * As JSON, this is:
 * {
 *    "type": "get-wal-res",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetWALRes extends FPWALRes<FPGetWALRes> {
    readonly type: FPEnvelopeType.GET_WALRES;
    readonly storeType: FPStoreType.WAL;
}

export interface FPPutWALReq {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
/*
 * A request to get a WAL file.
 * As JSON, this is:
 * {
 *    "type": "put-wal-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopePutWALReq extends FPWALReq<FPPutWALReq> {
    readonly type: FPEnvelopeType.PUT_WALREQ;
    readonly storeType: FPStoreType.WAL;
}

export interface FPDelWALReq {
    readonly cid: CID;
}
/*
 * The response to a PutWAL request.
 * As JSON, this is:
 * {
 *    "type": "del-wal-res",
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
export interface FPEnvelopeDelWALReq extends FPWALReq<FPDelWALReq> {
    readonly type: FPEnvelopeType.DEL_WALREQ;
    readonly storeType: FPStoreType.WAL;
}


export interface FPDelWALRes {
    readonly cid: CID;
    // optional deleted bytes
    readonly bytes?: Uint8Array;
}
/*
 * A request to get a WAL file.
 * As JSON, this is:
 * {
 *    "type": "get-wal-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeDelWALRes extends FPWALRes<FPDelWALRes> {
    readonly type: FPEnvelopeType.DEL_WALRES;
    readonly storeType: FPStoreType.WAL;
}

export interface FPWALReq<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_WALREQ | FPEnvelopeType.GET_WALREQ | FPEnvelopeType.PUT_WALREQ;
    readonly storeType: FPStoreType.WAL;
}

export interface FPWALRes<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_WALRES | FPEnvelopeType.GET_WALRES | FPEnvelopeType.PUT_WALRES;
    readonly storeType: FPStoreType.WAL;
}

export interface FPWALCarsOps {
    readonly cars: CID[];
  }


// export interface FPEnvelopeWAL extends FPEnvelope<WALState> {
//     readonly type: FPEnvelopeType.WAL;
// }


// export function WAL2FPMsg(fpcar: Uint8Array): Result<FPEnvelopeWAL> {
//     return Result.Ok({ type: FPEnvelopeType.WAL, payload: fpcar });
// }
