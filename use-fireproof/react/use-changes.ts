import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangesOptions, ClockHead, DocTypes, DocWithId, Database } from "@fireproof/core-types-base";
import type { ChangesResult } from "./types.js";

/**
 * Implementation of the useChanges hook
 */
export function createUseChanges(database: Database) {
  return function useChanges<T extends DocTypes>(since: ClockHead = [], opts: ChangesOptions = {}): ChangesResult<T> {
    const [loaded, setLoaded] = useState(false);
    const [result, setResult] = useState<Omit<ChangesResult<T>, "loaded">>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(opts), [opts]);

    const refreshRows = useCallback(async () => {
      const res = await database.changes<T>(since, opts);
      setResult({ ...res, docs: res.rows.map((r) => r.value as DocWithId<T>) });
      setLoaded(true);
    }, [since, queryString]);

    useEffect(() => {
      refreshRows(); // Initial data fetch
      return database.subscribe(refreshRows);
    }, [refreshRows]);

    return { ...result, loaded };
  };
}
