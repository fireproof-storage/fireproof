import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangesOptions, ClockHead, DocTypes, DocWithId } from "@fireproof/core";
import type { Database } from "@fireproof/core";
import type { ChangesResult } from "./types.js";

/**
 * Implementation of the useChanges hook
 */
export function createUseChanges(database: Database) {
  return function useChanges<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): ChangesResult<T> {
    const [result, setResult] = useState<ChangesResult<T>>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(opts), [opts]);

    const refreshRows = useCallback(async () => {
      const res = await database.changes<T>(since, opts);
      setResult({ ...res, docs: res.rows.map((r) => r.value as DocWithId<T>) });
    }, [since, queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return result;
  };
}
