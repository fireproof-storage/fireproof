import { type } from "arktype";

export const QSFileMeta = type({
  type: '"qs.file.meta"',
  key: "string",
  payload: {
    filename: "string",
    size: "number",
    created: "string",
    url: "string",
  },
});

export type QSFileMeta = typeof QSFileMeta.infer;

export function isQSFileMeta(x: unknown): x is QSFileMeta {
  return QSFileMeta(x) instanceof type.errors === false;
}

export const QSDocMeta = type({
  type: '"qs.doc.meta"',
  key: "string",
  payload: {
    cid: "string",
    url: "string",
    created: "string",
  },
});

export type QSDocMeta = typeof QSDocMeta.infer;

export function isQSDocMeta(x: unknown): x is QSDocMeta {
  return QSDocMeta(x) instanceof type.errors === false;
}
