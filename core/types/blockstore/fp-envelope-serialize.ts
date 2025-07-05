import { Result } from "@adviser/cement";
import { SuperThis } from "../types.js";

export interface SerializedMeta {
  readonly data: string; // base64pad encoded
  readonly parents: string[];
  readonly cid: string;
}

export type LinkOrCid = { "/": string } | string;

export interface SerializedWAL {
  readonly fileOperations?: { cid: LinkOrCid; public: boolean }[];
  readonly noLoaderOps?: { cars: LinkOrCid[] }[];
  readonly operations?: { cars: LinkOrCid[] }[];
}

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

export interface V2SerializedMetaKey {
  readonly metas: SerializedMeta[];
  readonly keys: string[];
}
