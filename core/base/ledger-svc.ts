import { Lazy, OnFunc } from "@adviser/cement";
import { Ledger } from "@fireproof/core-types-base";

class LedgerSvc {
  readonly onCreate = OnFunc<(ledger: Ledger) => void>();
  readonly onClose = OnFunc<(ledger: Ledger) => void>();
}

export const getLedgerSvc = Lazy(() => new LedgerSvc());
