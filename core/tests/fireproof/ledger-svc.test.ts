import { fireproof, getLedgerSvc } from "@fireproof/core-base";
import { describe, expect, it, vi } from "vitest";

describe("Ledger Service", () => {
  // the ledger service are a global singleton
  // which dispatch events like "ledger:created" and "ledger:closed" when ledgers are created and closed

  it("get LedgerSvc", async () => {
    const svc1 = getLedgerSvc();
    const svc2 = getLedgerSvc();
    expect(svc1).toBe(svc2);
  });

  it("dispatch onCreate and onClose events", async () => {
    const svc = getLedgerSvc();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    svc.onCreate(fn1);
    svc.onClose(fn2);

    const fp1 = [fireproof("db1"), fireproof("db1")];
    const fp2 = [fireproof("db2"), fireproof("db2")];

    await Promise.all(fp1.map((db) => db.close()));
    await Promise.all(fp2.map((db) => db.close()));

    expect(fn1).toHaveBeenCalledTimes(2);
    expect(fn1.mock.calls[0][0].refId()).toEqual(fp1[0].ledger.refId());
    expect(fn1.mock.calls[1][0].refId()).toEqual(fp2[0].ledger.refId());

    expect(fn2).toHaveBeenCalledTimes(2);
    expect(fn2.mock.calls[0][0].refId()).toEqual(fp1[1].ledger.refId());
    expect(fn2.mock.calls[1][0].refId()).toEqual(fp2[1].ledger.refId());
  });
});
