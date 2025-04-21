import { useCallback, useEffect, useState, useRef } from "react";
import type { DocSet, DocTypes, DocWithId, Database } from "@fireproof/core";
import { deepClone } from "./utils.js";
import type { DeleteDocFn, StoreDocFn, UseDocumentInitialDocOrFn, UseDocumentResult, UpdateDocFn } from "./types.js";

/**
 * Core implementation of the document hook
 * This is extracted to ensure all hooks are called at module level
 */
export function useFireproofDocument<T extends DocTypes>(
  database: Database,
  initialDocOrFn?: UseDocumentInitialDocOrFn<T>
): UseDocumentResult<T> {
  // Process initial document only once
  const initialDoc = typeof initialDocOrFn === "function"
    ? initialDocOrFn()
    : (initialDocOrFn ?? ({} as T));
  
  // Keep reference to initial document and last reset flag
  const initialDocRef = useRef(deepClone(initialDoc));
  const wasReset = useRef(false);

  // Document state
  const [doc, setDoc] = useState<DocSet<T>>(deepClone(initialDoc));

  // Refresh document from database
  const refresh = useCallback(async () => {
    // Skip if reset was recently called
    if (wasReset.current) return;
    
    if (doc._id) {
      try {
        const gotDoc = await database.get<T>(doc._id);
        if (!wasReset.current) {
          setDoc(gotDoc);
        }
      } catch {
        if (!wasReset.current) {
          setDoc(deepClone(initialDocRef.current));
        }
      }
    } else {
      if (!wasReset.current) {
        setDoc(deepClone(initialDocRef.current));
      }
    }
  }, [database, doc._id]);

  // Save document to database
  const save: StoreDocFn<T> = useCallback(
    async (existingDoc) => {
      const currentWasReset = wasReset.current;
      const toSave = existingDoc ?? doc;
      const res = await database.put(toSave);
      
      // Only update doc state if reset wasn't called during save
      // and this is the first save (no ID yet)
      if (!currentWasReset && !wasReset.current && !doc._id && !existingDoc) {
        setDoc(d => ({ ...d, _id: res.id }));
      }
      
      return res;
    },
    [database, doc],
  );

  // Remove document from database
  const remove: DeleteDocFn<T> = useCallback(
    async (existingDoc) => {
      const currentWasReset = wasReset.current;
      
      const id = existingDoc?._id ?? doc._id;
      if (!id) throw database.logger.Error().Msg(`Document must have an _id to be removed`).AsError();
      const gotDoc = await database.get<T>(id).catch(() => undefined);
      if (!gotDoc) throw database.logger.Error().Str("id", id).Msg(`Document not found`).AsError();
      const res = await database.del(id);
      
      // Only update if reset wasn't called
      if (!currentWasReset && !wasReset.current) {
        setDoc(deepClone(initialDocRef.current));
      }
      return res;
    },
    [database, doc._id],
  );

  // Merge partial document updates
  const merge = useCallback(
    (newDoc: Partial<T>) => {
      wasReset.current = false;
      setDoc((prev) => ({ ...prev, ...newDoc }));
    },
    [],
  );

  // Replace entire document
  const replace = useCallback(
    (newDoc: T) => {
      wasReset.current = false;
      setDoc(newDoc);
    },
    [],
  );

  // Reset document to original state - this must always win over save
  const reset = useCallback(() => {
    // Set flag to block any in-flight operations
    wasReset.current = true;
    
    // Reset document state immediately
    setDoc(deepClone(initialDocRef.current));
  }, []);

  // Legacy-compatible updateDoc function that matches the expected UpdateDocFn type
  const updateDoc = useCallback(
    (newDoc?: DocSet<T>, opts = { replace: false, reset: false }) => {
      if (!newDoc) {
        return opts.reset ? reset() : refresh();
      }
      
      if (opts.replace) {
        return replace(newDoc as T);
      } else {
        return merge(newDoc);
      }
    },
    [refresh, reset, replace, merge],
  ) as UpdateDocFn<T>; // Cast to expected type

  // Submit doc to database
  const submit = useCallback(
    async (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      return save();
    },
    [save],
  );

  // Sync memory from storage on downstream changes
  useEffect(() => {
    if (!doc._id) {
      return; // No need to subscribe if we don't have an ID
    }
    
    // Use the database subscription method
    const unsubscribe = database.subscribe((changes) => {
      // Don't process changes if reset was called
      if (wasReset.current) {
        return;
      }
      
      // Only refresh if our document changed
      const ourChange = changes.find(change => change._id === doc._id);
      if (ourChange) {
        void refresh();
      }
    }, true);

    return unsubscribe;
  }, [database, doc._id, refresh]);

  // Reset the wasReset flag after a short delay to allow ongoing operations to complete
  useEffect(() => {
    if (wasReset.current) {
      const timeout = setTimeout(() => {
        wasReset.current = false;
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [doc]);

  // Create a copy of the document for the return value
  const docObj = { ...doc } as DocWithId<T>;
  
  // Create the final API arrays and objects
  const tuple = [docObj, updateDoc, save, remove, reset, refresh];
  const methods = { doc: docObj, merge, replace, reset, refresh, save, remove, submit };
  
  // Build the result object that supports both object and array patterns
  // We need to cast through unknown first to satisfy TypeScript
  const result = Object.assign({}, methods) as unknown as Partial<UseDocumentResult<T>>;
  
  // Add array indices to support destructuring
  tuple.forEach((item, i) => {
    result[i] = item;
  });
  
  // Add iterator support for array destructuring
  Object.defineProperty(result, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      for (const item of tuple) {
        yield item;
      }
    }
  });
  
  return result as UseDocumentResult<T>;
}
