import { type } from "arktype";

export const QCDoc = type({
  type: '"qc.doc"',
  id: "string",
  fileRefs: "string[]",
  synced: "string[]",
  payload: "unknown",
});

export const QCFile = type({
  type: '"qc.file"',
  cid: "string",
  filename: "string",
  synced: "string[]",
  payload: type.instanceOf(Uint8Array),
});

export const QCEnvelope = QCDoc.or(QCFile);

export type QCDoc = typeof QCDoc.infer;
export type QCFile = typeof QCFile.infer;
export type QCEnvelope = typeof QCEnvelope.infer;

export function isQCDoc(x: unknown): x is QCDoc {
  return QCDoc(x) instanceof type.errors === false;
}

export function isQCFile(x: unknown): x is QCFile {
  return QCFile(x) instanceof type.errors === false;
}

export function isQCEnvelope(x: unknown): x is QCEnvelope {
  return QCEnvelope(x) instanceof type.errors === false;
}
