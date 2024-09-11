import { CID } from "multiformats";
import { encode, decode } from "cborg";
import { Result } from "@adviser/cement"

export interface FPEnvelope<T> {
    readonly type: string; // "car" | "file" | "meta" | "wal"
    readonly payload: T
}

export interface FPEnvelopeCar extends FPEnvelope<Uint8Array> {
    readonly type: "car";
}

export interface FPEnvelopeFile extends FPEnvelope<Uint8Array> {
    readonly type: "file";
}

export interface FPMeta {
    readonly cid: string;
    readonly data: Uint8Array;
    readonly parents: string[];
}

export interface FPEnvelopeMeta extends FPEnvelope<FPMeta> {
    readonly type: "meta";
}

export interface FPWALCarsOps {
    readonly cars: CID[];
}
export interface FPWAL {
    // fileOperations: any[]; will be added with connector-fixes
    // noLoaderOps: any[]; will be added with connector-fixes
    readonly operations: FPWALCarsOps[];
}
export interface FPEnvelopeWAL extends FPEnvelope<FPWAL> {
    readonly type: "wal";
}

export function WAL2FPMsg(fpwal: FPWAL): Uint8Array {
    return encode({ type: "wal", payload: JSON.parse(JSON.stringify(fpwal)) } as FPEnvelopeWAL);
}

export function FPMsg2WAL(fpmsg: Uint8Array): Result<FPWAL> {
    const renv = FPMsgMatch2Envelope(fpmsg, "wal");
    if (renv.isErr()) {
        return Result.Err(renv.Err());
    }
    const convertCids = renv.Ok().payload as FPWAL;
    for (const op of convertCids.operations) {
        const cars = []
        for (const strCid of op.cars) {
            for (const cidVal of Object.values(strCid)) {
                cars.push(CID.parse(cidVal));
            }
        }
        (op as {cars: CID[]}).cars = cars;
    }
    return Result.Ok(renv.Ok().payload as FPWAL);
}

export function Meta2FPMsg(fpmeta: FPMeta): Uint8Array {
    return encode({ type: "meta", payload: fpmeta } as FPEnvelopeMeta);
}

export function FPMsg2Meta(fpmsg: Uint8Array): Result<FPMeta> {
    const renv = FPMsgMatch2Envelope(fpmsg, "meta");
    if (renv.isErr()) {
        return Result.Err(renv.Err());
    }
    return Result.Ok(renv.Ok().payload as FPMeta);
}

export function Car2FPMsg(fpcar: Uint8Array): Uint8Array {
    return encode({ type: "car", payload: fpcar } as FPEnvelopeCar);
}

export function FPMsg2Car(fpmsg: Uint8Array): Result<Uint8Array> {
    const renv = FPMsgMatch2Envelope(fpmsg, "car");
    if (renv.isErr()) {
        return Result.Err(renv.Err());
    }
    return Result.Ok(renv.Ok().payload as Uint8Array);
}

export function File2FPMsg(fpfile: Uint8Array): Uint8Array {
    return encode({ type: "file", payload: fpfile } as FPEnvelopeFile);
}

export function FPMsg2File(fpmsg: Uint8Array): Result<Uint8Array> {
    const renv = FPMsgMatch2Envelope(fpmsg, "file");
    if (renv.isErr()) {
        return Result.Err(renv.Err());
    }
    return Result.Ok(renv.Ok().payload as Uint8Array);
}

export function FPMsgMatch2Envelope(fpmsg: Uint8Array, ...types: string[]): Result<FPEnvelope<unknown>> {
    let env: FPEnvelope<unknown>;
    try {
        env = decode(fpmsg);
    } catch (e) {
        return Result.Err(`failed to decode envelope: ${e}`);
    }
    if (typeof env !== "object") {
        return Result.Err(`expected envelope to be an object`);
    }
    if (typeof env.type !== "string") {
        return Result.Err(`expected type to be a string`);
    }
    if (types.length > 0 && !types.includes(env.type)) {
        return Result.Err(`expected type to be ${types}`);
    }
    // need to check if the payload is a valid WAL
    return Result.Ok(env);
}