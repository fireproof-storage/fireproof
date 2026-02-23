import { type } from "arktype";

export const PayloadBase = type({
  idxName: "string",
  cid: "string",
  url: "string",
  created: "string",
});

export const QSFileMeta = type({
  type: '"qs.file.meta"',
  key: "string",
  payload: type({
    filename: "string",
    size: "number",
  }).and(PayloadBase),
});

export type QSFileMeta = typeof QSFileMeta.infer;

export function isQSFileMeta(x: unknown): x is QSFileMeta {
  return QSFileMeta(x) instanceof type.errors === false;
}

export const QSDeviceMeta = type({
  type: '"qs.device.meta"',
  key: "string", // deviceId
  payload: type({
    // deviceId: "string",
    who: "'me' | 'other'",
    "deleted?": "boolean",
  }).and(PayloadBase),
});

export type QSDeviceMeta = typeof QSDeviceMeta.infer;

export function isQSDeviceMeta(x: unknown): x is QSDeviceMeta {
  return QSDeviceMeta(x) instanceof type.errors === false;
}

export const QSDocMeta = type({
  type: '"qs.doc.meta"',
  key: "string",
  payload: type({
    primaryKey: "string",
  }).and(PayloadBase),
});

export type QSDocMeta = typeof QSDocMeta.infer;

export function isQSDocMeta(x: unknown): x is QSDocMeta {
  return QSDocMeta(x) instanceof type.errors === false;
}

export const QSIdxValueMeta = type({
  type: '"qs.emit.value"',
  key: "string",
  payload: {
    keys: "unknown[]",
    "emitValue?": "unknown",
  },
});

export type QSIdxValueMeta = typeof QSIdxValueMeta.infer;

export function isQSEmitIdxValueMeta(x: unknown): x is QSIdxValueMeta {
  return QSIdxValueMeta(x) instanceof type.errors === false;
}
