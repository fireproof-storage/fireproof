import { FPEnvelopeTurnaround, FPEnvelopeType, FPStoreType } from "./fp-envelope";
import { CID } from "multiformats";

export interface FPGetFileReq {
    readonly cid: CID;
    readonly fileName?: string;
}
/*
 * A request to get a FILE file.
 * As JSON, this is:
 * {
 *    "type": "get-file-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetFileReq extends FPFileReq<FPGetFileReq> {
    readonly type: FPEnvelopeType.GET_FILEREQ;
    readonly storeType: FPStoreType.FILE;
}

export interface FPGetFileRes {
    readonly cid: CID;
    readonly fileName?: string;
    readonly bytes: Uint8Array;
}
/*
 * The response to a GetFile request.
 * As JSON, this is:
 * {
 *    "type": "get-file-res",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeGetFileRes extends FPFileRes<FPGetFileRes> {
    readonly type: FPEnvelopeType.GET_FILERES;
    readonly storeType: FPStoreType.FILE;
}

export interface FPPutFileReq {
    readonly cid: CID;
    readonly fileName?: string;
    readonly bytes: Uint8Array;
}
/*
 * A request to get a FILE file.
 * As JSON, this is:
 * {
 *    "type": "put-file-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopePutFileReq extends FPFileReq<FPPutFileReq> {
    readonly type: FPEnvelopeType.PUT_FILEREQ;
    readonly storeType: FPStoreType.FILE;
}

export interface FPDelFileReq {
    readonly cid: CID;
    readonly fileName?: string;
}
/*
 * The response to a PutFile request.
 * As JSON, this is:
 * {
 *    "type": "del-file-res",
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
export interface FPEnvelopeDelFileReq extends FPFileReq<FPDelFileReq> {
    readonly type: FPEnvelopeType.DEL_FILEREQ;
    readonly storeType: FPStoreType.FILE;
}


export interface FPDelFileRes {
    readonly cid: CID;
    readonly fileName?: string;
    // optional deleted bytes
    readonly bytes?: Uint8Array;
}
/*
 * A request to get a FILE file.
 * As JSON, this is:
 * {
 *    "type": "get-file-req",
 *    "tid": "123",
 *    "payload": {
 *       "cid": "bafybeib2v"
 *       "bytes": [0x65, 0x66, 0x67, ...],
 *    }
 *    "auth": { ... }
 *    "meta": { ... }
 * }
 */
export interface FPEnvelopeDelFileRes extends FPFileRes<FPDelFileRes> {
    readonly type: FPEnvelopeType.DEL_FILERES;
    readonly storeType: FPStoreType.FILE;
}


export interface FPFileReq<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_FILEREQ | FPEnvelopeType.GET_FILEREQ | FPEnvelopeType.PUT_FILEREQ;
    readonly storeType: FPStoreType.FILE;
}

export interface FPFileRes<T> extends FPEnvelopeTurnaround<T> {
    readonly type: FPEnvelopeType.DEL_FILERES | FPEnvelopeType.GET_FILERES | FPEnvelopeType.PUT_FILERES;
    readonly storeType: FPStoreType.FILE;
}



// export interface FPEnvelopeFile extends FPEnvelope<Uint8Array> {
//     readonly type: FPEnvelopeType.FILE;
// }

// export function File2FPMsg(fpcar: Uint8Array): Result<FPEnvelopeFile> {
//     return Result.Ok({ type: FPEnvelopeType.FILE, payload: fpcar });
// }
