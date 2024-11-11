import { FPEnvelopeTurnaround, FPEnvelopeType, FPStoreType } from "./fp-envelope";
import { CID } from "multiformats";

export interface FPGetMetaReq {
    readonly cid: CID;
}
/*
 * A request to get a META file.
 * As JSON, this is:
 * {
 *    "type": "get-meta-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetMetaReq extends FPMetaReq<FPGetMetaReq> {
    readonly type: FPEnvelopeType.GET_METAREQ;
    readonly storeType: FPStoreType.META;
}

export interface FPGetMetaRes {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
/*
 * The response to a GetMeta request.
 * As JSON, this is:
 * {
 *    "type": "get-meta-res",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetMetaRes extends FPMetaRes<FPGetMetaRes> {
    readonly type: FPEnvelopeType.GET_METARES;
    readonly storeType: FPStoreType.META;
}

export interface FPPutMetaReq {
    readonly cid: CID;
    readonly bytes: Uint8Array;
}
/*
 * A request to get a META file.
 * As JSON, this is:
 * {
 *    "type": "put-meta-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopePutMetaReq extends FPMetaReq<FPPutMetaReq> {
    readonly type: FPEnvelopeType.PUT_METAREQ;
    readonly storeType: FPStoreType.META;
}

export interface FPDelMetaReq {
    readonly cid: CID;
}
/*
 * The response to a PutMeta request.
 * As JSON, this is:
 * {
 *    "type": "del-meta-res",
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
export interface FPEnvelopeDelMetaReq extends FPMetaReq<FPDelMetaReq> {
    readonly type: FPEnvelopeType.DEL_METAREQ;
    readonly storeType: FPStoreType.META;
}


export interface FPDelMetaRes {
    readonly cid: CID;
    // optional deleted bytes
    readonly bytes?: Uint8Array;
}
/*
 * A request to get a META file.
 * As JSON, this is:
 * {
 *    "type": "get-meta-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeDelMetaRes extends FPMetaRes<FPDelMetaRes> {
    readonly type: FPEnvelopeType.DEL_METARES;
    readonly storeType: FPStoreType.META;
}

export interface FPMetaReq<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_METAREQ | FPEnvelopeType.GET_METAREQ | FPEnvelopeType.PUT_METAREQ;
    readonly storeType: FPStoreType.META;
}

export interface FPMetaRes<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_METARES | FPEnvelopeType.GET_METARES | FPEnvelopeType.PUT_METARES;
    readonly storeType: FPStoreType.META;
}


// export interface FPEnvelopeMeta extends FPEnvelope<Uint8Array> {
//     readonly type: FPEnvelopeType.META;
// }

// export function Meta2FPMsg(fpcar: Uint8Array): Result<FPEnvelopeMeta> {
//     return Result.Ok({ type: FPEnvelopeType.META, payload: fpcar });
// }
