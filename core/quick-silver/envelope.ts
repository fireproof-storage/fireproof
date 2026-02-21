import { type } from "arktype";

export const QS_Base = type({
  cid: "string",
  synced: "string[]",
});

export const QS_Doc = type({
  type: '"doc"',
  id: "string",
  fileRefs: "string[]",
}).and(QS_Base);

export const QS_File = type({
  type: '"file"',
  filename: "string",
}).and(QS_Base);

export const QS_DocFile = QS_Base.and(
  type({
    type: '"doc"',
    id: "string",
    fileRefs: QS_File.array(),
  }),
);

export type QS_Base = typeof QS_Base.infer;
export type QS_Doc = typeof QS_Doc.infer;
export type QS_File = typeof QS_File.infer;
export type QS_DocFile = typeof QS_DocFile.infer;

export const QCDoc = type({
  type: '"qc.doc"',
  _: QS_Doc,
  data: "unknown",
});

export const QCFile = type({
  type: '"qc.file"',
  _: QS_File,
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
