import { useCallback, useEffect, useMemo, useState } from "react";
import type { AllDocsQueryOpts, DocTypes, DocWithId, Database } from "@fireproof/core";
import type { AllDocsResult } from "./types.js";

/**
 * Implementation of the useAllDocs hook
 */
export function createUseAllDocs(database: Database) {
  return function useAllDocs<T extends DocTypes>(query: AllDocsQueryOpts = {}): AllDocsResult<T> {
    const [result, setResult] = useState<AllDocsResult<T>>({
      docs: [],
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);

    const refreshRows = useCallback(async () => {
      const res = await database.allDocs<T>(query);
      setResult({
        docs: res.rows.map((r) => r.value as DocWithId<T>),
      });
    }, [database, queryString]);

    useEffect(() => {
      refreshRows();
      const unsubscribe = database.subscribe(refreshRows);
      return () => {
        unsubscribe();
      };
    }, [database, refreshRows]);

    return result;
  };
}
