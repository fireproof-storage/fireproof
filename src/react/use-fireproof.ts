import type { ConfigOpts, Database, DocSet, DocTypes } from "@fireproof/core";
import { fireproof } from "@fireproof/core";
import { useMemo } from "react";
import type { UseFireproof } from "./types.js";
import { createUseDocument } from "./use-document.js";
import { createUseLiveQuery } from "./use-live-query.js";
import { createUseAllDocs } from "./use-all-docs.js";
import { createUseChanges } from "./use-changes.js";

/**
 * @deprecated Use the `useFireproof` hook instead
 */
export const FireproofCtx = {} as UseFireproof;

/**
 *
 * ## Summary
 *
 * React hook to create a custom-named Fireproof database and provides the utility hooks to query against it.
 *
 * ## Usage
 * ```tsx
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname");
 * const { database, useLiveQuery, useDocument } = useFireproof("dbname", { ...options });
 * ```
 *
 *
 */
/**
 * Creates a proxy database that only initializes the actual database on first write operation
 */
function createLazyDatabase(name: string, config: ConfigOpts = {}): Database {
  let _database: Database | null = null;
  const _subscribers = new Set<(changes: unknown[]) => void>();

  // Initialize the database only when needed
  const getDatabase = (): Database => {
    if (!_database) {
      _database = fireproof(name, config);

      // Set up real subscription forwarding
      _database.subscribe((changes) => {
        _subscribers.forEach((subscriber) => subscriber(changes));
      }, true);
    }
    return _database;
  };

  // Detect write operations that should trigger database initialization
  const isWriteOperation = (method: string): boolean => {
    return ["put", "bulk", "del", "create", "transact"].includes(method);
  };

  // Create a proxy to intercept all database method calls
  return new Proxy<Database>({} as Database, {
    get(target, prop, receiver) {
      // Handle constructor name for type checking
      if (prop === "constructor") {
        return { name: "Database" };
      }

      // Handle name property
      if (prop === "name") {
        return name;
      }

      // Return a function that will initialize the database if it's a write operation
      if (typeof prop === "string" || typeof prop === "symbol") {
        // Handle get method to open DB and fetch
        if (prop === "get") {
          return async function get(id: string) {
            const db = getDatabase();
            return db.get(id);
          };
        }

        // Handle query methods: open DB and query
        if (prop === "query" || prop === "allDocs") {
          return async function query(...args: unknown[]) {
            const db = getDatabase();
            // Bind to ensure correct 'this' context for database methods
            const method = (db as unknown as Record<string, (...methodArgs: unknown[]) => unknown>)[prop as string];
            return method.apply(db, args);
          };
        }

        // Handle put to make sure it triggers database initialization
        if (prop === "put") {
          return async function put<T extends DocTypes>(doc: DocSet<T>) {
            // Always initialize the database for put operations
            const db = getDatabase();
            return db.put(doc);
          };
        }

        // Handle bulk operation
        if (prop === "bulk") {
          return async function bulk(docs: Record<string, unknown>[]) {
            // Always initialize the database for bulk operations
            const db = getDatabase();
            return db.bulk(docs);
          };
        }

        // Handle subscribe method to collect subscribers even before DB is initialized
        if (prop === "subscribe") {
          return function subscribe(callback: (changes: unknown[]) => void) {
            _subscribers.add(callback);

            // Always initialize database for subscriptions
            const db = getDatabase();
            return db.subscribe(callback as (changes: Record<string, unknown>[]) => void);
          };
        }

        // Handle close and destroy methods
        if (prop === "close" || prop === "destroy") {
          return async function () {
            if (_database) {
              const method = _database[prop] as () => Promise<unknown>;
              return method.call(_database);
            }
            return Promise.resolve();
          };
        }

        // For all other methods
        return function (...args: unknown[]) {
          // Always initialize database for write operations
          if (isWriteOperation(prop as string)) {
            const db = getDatabase();
            // Use type assertion to call method safely
            const method = (db as unknown as Record<string, (...methodArgs: unknown[]) => unknown>)[prop as string];
            if (typeof method === "function") {
              return method.apply(db, args);
            }
            return undefined;
          }

          // For read operations, only use the database if it's already initialized
          if (_database) {
            // Use type assertion to call method safely
            const method = (_database as unknown as Record<string, (...methodArgs: unknown[]) => unknown>)[prop as string];
            if (typeof method === "function") {
              return method.apply(_database, args);
            }
            return undefined;
          }

          // Return appropriate no-op responses for other methods
          return function noOp() {
            /* no-op */
          };
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * React hook to create a Fireproof database with lazy initialization
 *
 * @param name The name of the database or an existing database instance
 * @param config Configuration options for the database
 * @returns UseFireproof object with database and hooks
 */
export function useFireproof(name: string | Database = "useFireproof", config: ConfigOpts = {}): UseFireproof {
  // Use useMemo to ensure stable references across renders
  return useMemo(() => {
    // If the user passed an existing database instance, use it directly
    // Otherwise create a lazy database that only initializes on first write
    const database = typeof name === "string" ? createLazyDatabase(name, config) : name;

    const useDocument = createUseDocument(database);
    const useLiveQuery = createUseLiveQuery(database);
    const useAllDocs = createUseAllDocs(database);
    const useChanges = createUseChanges(database);

    return { database, useLiveQuery, useDocument, useAllDocs, useChanges };
  }, [name, JSON.stringify(config)]); // Only recreate if name or stringified config changes
}

// Export types
export type {
  LiveQueryResult,
  UseDocumentResult,
  AllDocsResult,
  ChangesResult,
  UseDocument,
  UseLiveQuery,
  UseAllDocs,
  UseChanges,
  UseFireproof,
} from "./types.js";
