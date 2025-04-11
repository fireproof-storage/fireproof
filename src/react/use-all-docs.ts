import { useCallback, useEffect, useMemo, useState } from "react";
import type { AllDocsQueryOpts, DocTypes, DocWithId, Database } from "@fireproof/core";
import type { AllDocsResult } from "./types.js";

// Internal shadow type for array-like behavior (implementation detail)
type EnhancedAllDocsResult<T extends DocTypes> = AllDocsResult<T> & DocWithId<T>[];

/**
 * Implementation of the useAllDocs hook
 */
export function createUseAllDocs(database: Database) {
  return function useAllDocs<T extends DocTypes>(query: AllDocsQueryOpts = {}): AllDocsResult<T> {
    const [result, setResult] = useState<EnhancedAllDocsResult<T>>(() => {
      const docs: DocWithId<T>[] = [];
      return Object.assign(docs, {
        docs,
        rows: [],
      });
    });

    const queryString = useMemo(() => JSON.stringify(query), [query]);

    const refreshRows = useCallback(async () => {
      const res = await database.allDocs<T>(query);
      const docs = res.rows.map((r) => r.value as DocWithId<T>);
      setResult(
        Object.assign(docs, {
          docs,
          rows: res.rows,
        }),
      );
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
