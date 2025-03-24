import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { DocSet, DocTypes, DocWithId } from "@fireproof/core";
import type { Database } from "@fireproof/core";
import { deepClone } from "./utils.js";
import type { DeleteDocFn, StoreDocFn, UseDocumentInitialDocOrFn, UseDocumentResult } from "./types.js";

/**
 * Implementation of the useDocument hook
 */
export function createUseDocument(database: Database) {
  const updateHappenedRef = useRef(false);

  return function useDocument<T extends DocTypes>(initialDocOrFn?: UseDocumentInitialDocOrFn<T>): UseDocumentResult<T> {
    let initialDoc: DocSet<T>;
    if (typeof initialDocOrFn === "function") {
      initialDoc = initialDocOrFn();
    } else {
      initialDoc = initialDocOrFn ?? ({} as T);
    }

    const originalInitialDoc = useMemo(() => deepClone({ ...initialDoc }), []);

    const [doc, setDoc] = useState(initialDoc);

    const refresh = useCallback(async () => {
      const gotDoc = doc._id ? await database.get<T>(doc._id).catch(() => initialDoc) : initialDoc;
      setDoc(gotDoc);
    }, [doc._id]);

    const save: StoreDocFn<T> = useCallback(
      async (existingDoc) => {
        updateHappenedRef.current = false;
        const toSave = existingDoc ?? doc;
        const res = await database.put(toSave);

        if (!updateHappenedRef.current && !doc._id && !existingDoc) {
          setDoc((d) => ({ ...d, _id: res.id }));
        }

        return res;
      },
      [doc],
    );

    const remove: DeleteDocFn<T> = useCallback(
      async (existingDoc) => {
        const id = existingDoc?._id ?? doc._id;
        if (!id) throw database.logger.Error().Msg(`Document must have an _id to be removed`).AsError();
        const gotDoc = await database.get<T>(id).catch(() => undefined);
        if (!gotDoc) throw database.logger.Error().Str("id", id).Msg(`Document not found`).AsError();
        const res = await database.del(id);
        setDoc(initialDoc);
        return res;
      },
      [doc, initialDoc],
    );

    // New granular update methods
    const merge = useCallback((newDoc: Partial<T>) => {
      updateHappenedRef.current = true;
      setDoc((prev) => ({ ...prev, ...newDoc }));
    }, []);

    const replace = useCallback((newDoc: T) => {
      updateHappenedRef.current = true;
      setDoc(newDoc);
    }, []);

    const reset = useCallback(() => {
      updateHappenedRef.current = true;
      setDoc({ ...originalInitialDoc });
    }, [originalInitialDoc]);

    // Legacy-compatible updateDoc
    const updateDoc = useCallback(
      (newDoc?: DocSet<T>, opts = { replace: false, reset: false }) => {
        if (!newDoc) {
          return opts.reset ? reset() : refresh();
        }
        return opts.replace ? replace(newDoc as T) : merge(newDoc);
      },
      [refresh, reset, replace, merge],
    );

    useEffect(() => {
      if (!doc._id) return;
      return database.subscribe((changes) => {
        if (updateHappenedRef.current) {
          return;
        }
        if (changes.find((c) => c._id === doc._id)) {
          void refresh();
        }
      }, true);
    }, [doc._id, refresh]);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    const submit = useCallback(
      async (e?: Event) => {
        if (e?.preventDefault) e.preventDefault();
        await save();
        reset();
      },
      [save, reset],
    );

    // Primary Object API with both new and legacy methods
    const apiObject = {
      doc: { ...doc } as DocWithId<T>,
      merge,
      replace,
      reset,
      refresh,
      save,
      remove,
      submit,
    };

    // Make the object properly iterable
    const tuple = [{ ...doc }, updateDoc, save, remove, reset, refresh];
    Object.assign(apiObject, tuple);
    Object.defineProperty(apiObject, Symbol.iterator, {
      enumerable: false,
      value: function* () {
        yield* tuple;
      },
    });

    return apiObject as UseDocumentResult<T>;
  };
}
