import { type } from "arktype";

// ── shared base types ─────────────────────────────────────────────────────────

export const QSCloudAuth = type({
  type: "string",
  token: "string",
});

export const QSDbName = type({
  db: "string",
  auth: QSCloudAuth,
});

export const QSTid = type({
  tid: "string",
});

export const QSArg = type({
  arg: "number",
});

// ── individual ops (no tid/db — those live on the request) ───────────────────

export const QSPut = type({
  key: "string",
  data: type.instanceOf(Uint8Array),
});

export const QSGet = type({
  key: "string",
  "idx?": "string",
});

export const QSQuery = type({
  // filter / pred: coming later
});

// ── individual requests ───────────────────────────────────────────────────────

export const QSReqGet = type({ type: '"QSReqGet"' }).and(QSGet).and(QSTid).and(QSArg).and(QSDbName);

export const QSReqPut = type({ type: '"QSReqPut"' }).and(QSPut).and(QSTid).and(QSArg).and(QSDbName);

// ── query request ─────────────────────────────────────────────────────────────

export const QSReqQuery = type({ type: '"QSReqQuery"' }).and(QSQuery).and(QSTid).and(QSDbName).and(QSArg);

// ── subscribe requests ────────────────────────────────────────────────────────

export const QSReqRegisterSubscribe = type({ type: '"QSReqRegisterSubscribe"' }).and(QSTid).and(QSArg).and(QSDbName);

export const QSReqUnregisterSubscribe = type({ type: '"QSReqUnregisterSubscribe"' }).and(QSTid).and(QSArg).and(QSDbName);

// ── responses ─────────────────────────────────────────────────────────────────

export const QSResGet = type({
  type: '"QSResGet"',
  key: "string",
  data: type.instanceOf(Uint8Array),
}).and(QSTid).and(QSArg);

export const QSResGetNotFound = type({
  type: '"QSResGetNotFound"',
  key: "string",
}).and(QSTid).and(QSArg);

export const QSResPut = type({
  type: '"QSResPut"',
  key: "string",
}).and(QSTid).and(QSArg);

export const QSResErr = type({
  type: '"QSResErr"',
  error: "string",
}).and(QSTid).and(QSArg);

// ── subscribe responses ───────────────────────────────────────────────────────

export const QSResRegisterSubscribe = type({
  type: '"QSResRegisterSubscribe"',
  db: "string",
}).and(QSTid).and(QSArg);

export const QSEvtSubscribe = type({
  type: '"QSEvtSubscribe"',
  msg: type({
    key: "string",
    data: type.instanceOf(Uint8Array),
  }),
}).and(QSTid);

// ── query streaming response ──────────────────────────────────────────────────

export const QSQueryRowMeta = type({
  id: "string",
  cid: "string",
  synced: "number",
});

export const QSResQueryBegin = type({
  type: '"QSResQueryBegin"',
}).and(QSTid).and(QSArg);

export const QSResQueryRow = type({
  type: '"QSResQueryRow"',
  rowNr: "number",
  row: type({
    _: QSQueryRowMeta,
    payload: type.instanceOf(Uint8Array),
  }),
}).and(QSTid).and(QSArg);

export const QSResQueryEnd = type({
  type: '"QSResQueryEnd"',
  rows: "number",
}).and(QSTid).and(QSArg);

export const QSOpRes = QSResGet
  .or(QSResGetNotFound)
  .or(QSResPut)
  .or(QSResErr)
  .or(QSResQueryBegin)
  .or(QSResQueryRow)
  .or(QSResQueryEnd)
  .or(QSResRegisterSubscribe)
  .or(QSEvtSubscribe);

// ── server message (response + transaction id) ────────────────────────────────

export const QSMsg = QSTid.and(QSOpRes);

// ── inferred types ────────────────────────────────────────────────────────────

export type QSCloudAuth = typeof QSCloudAuth.infer;
export type QSDbName = typeof QSDbName.infer;
export type QSTid = typeof QSTid.infer;
export type QSArg = typeof QSArg.infer;

export type QSPut = typeof QSPut.infer;
export type QSGet = typeof QSGet.infer;
export type QSQuery = typeof QSQuery.infer;
export type QSReqGet = typeof QSReqGet.infer;
export type QSReqPut = typeof QSReqPut.infer;
export type QSReqQuery = typeof QSReqQuery.infer;
export type QSReqRegisterSubscribe = typeof QSReqRegisterSubscribe.infer;
export type QSReqUnregisterSubscribe = typeof QSReqUnregisterSubscribe.infer;

export type QSResGet = typeof QSResGet.infer;
export type QSResGetNotFound = typeof QSResGetNotFound.infer;
export type QSResPut = typeof QSResPut.infer;
export type QSResErr = typeof QSResErr.infer;
export type QSResRegisterSubscribe = typeof QSResRegisterSubscribe.infer;
export type QSEvtSubscribe = typeof QSEvtSubscribe.infer;
export type QSQueryRowMeta = typeof QSQueryRowMeta.infer;
export type QSResQueryBegin = typeof QSResQueryBegin.infer;
export type QSResQueryRow = typeof QSResQueryRow.infer;
export type QSResQueryEnd = typeof QSResQueryEnd.infer;
export type QSOpRes = typeof QSOpRes.infer;
export type QSMsg = typeof QSMsg.infer;

// ── type guards ───────────────────────────────────────────────────────────────

export function isQSPut(x: unknown): x is QSPut {
  return QSPut(x) instanceof type.errors === false;
}

export function isQSGet(x: unknown): x is QSGet {
  return QSGet(x) instanceof type.errors === false;
}


export function isQSQuery(x: unknown): x is QSQuery {
  return QSQuery(x) instanceof type.errors === false;
}

export function isQSReqGet(x: unknown): x is QSReqGet {
  return QSReqGet(x) instanceof type.errors === false;
}

export function isQSReqPut(x: unknown): x is QSReqPut {
  return QSReqPut(x) instanceof type.errors === false;
}

export function isQSReqQuery(x: unknown): x is QSReqQuery {
  return QSReqQuery(x) instanceof type.errors === false;
}

export function isQSResGet(x: unknown): x is QSResGet {
  return QSResGet(x) instanceof type.errors === false;
}

export function isQSResGetNotFound(x: unknown): x is QSResGetNotFound {
  return QSResGetNotFound(x) instanceof type.errors === false;
}

export function isQSResPut(x: unknown): x is QSResPut {
  return QSResPut(x) instanceof type.errors === false;
}


export function isQSResErr(x: unknown): x is QSResErr {
  return QSResErr(x) instanceof type.errors === false;
}

export function isQSResQueryBegin(x: unknown): x is QSResQueryBegin {
  return QSResQueryBegin(x) instanceof type.errors === false;
}

export function isQSResQueryRow(x: unknown): x is QSResQueryRow {
  return QSResQueryRow(x) instanceof type.errors === false;
}

export function isQSResQueryEnd(x: unknown): x is QSResQueryEnd {
  return QSResQueryEnd(x) instanceof type.errors === false;
}

export function isQSReqRegisterSubscribe(x: unknown): x is QSReqRegisterSubscribe {
  return QSReqRegisterSubscribe(x) instanceof type.errors === false;
}

export function isQSReqUnregisterSubscribe(x: unknown): x is QSReqUnregisterSubscribe {
  return QSReqUnregisterSubscribe(x) instanceof type.errors === false;
}

export function isQSResRegisterSubscribe(x: unknown): x is QSResRegisterSubscribe {
  return QSResRegisterSubscribe(x) instanceof type.errors === false;
}

export function isQSEvtSubscribe(x: unknown): x is QSEvtSubscribe {
  return QSEvtSubscribe(x) instanceof type.errors === false;
}

export function isQSOpRes(x: unknown): x is QSOpRes {
  return QSOpRes(x) instanceof type.errors === false;
}

export function isQSMsg(x: unknown): x is QSMsg {
  return QSMsg(x) instanceof type.errors === false;
}
