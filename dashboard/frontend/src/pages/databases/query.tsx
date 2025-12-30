/**
 * Query editor page for Fireproof databases.
 * Allows users to write and execute map functions against database documents.
 *
 * Security: User code executes in a WASM sandbox (quickjs-emscripten)
 * to prevent code injection attacks.
 */
import React, { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { EditableCodeHighlight } from "../../components/CodeHighlight.jsx";
import { DynamicTable, TableRow } from "../../components/DynamicTable.jsx";
import { headersForDocs } from "../../components/dynamicTableHelpers.js";
import {
  initSandbox,
  validateCode,
  executeMapFn,
  SandboxDocument,
  MapResult,
} from "../../services/sandbox-service.js";

/**
 * Main query editor component.
 * Provides a code editor for map functions and displays query results.
 */
export function DatabasesQuery() {
  const { name } = useParams();
  if (!name) throw new Error("No database name provided");

  const emptyMap = `(doc, emit) => { emit(doc._id, doc) }`;

  const [editorCode, setEditorCode] = useState<string>(emptyMap);
  const [editorCodeFnString, setEditorCodeFnString] = useState<string>(() => editorCode);
  const [userCodeError, setUserCodeError] = useState<string | null>(null);
  const [sandboxReady, setSandboxReady] = useState<boolean | null>(null);

  // Initialize sandbox on mount
  useEffect(() => {
    initSandbox().then(setSandboxReady);
  }, []);

  /**
   * Handle code editor changes.
   * @param code - Updated code from the editor
   */
  function editorChanged({ code }: { code: string }) {
    setEditorCode(code);
  }

  /**
   * Validate and run the query.
   * Uses sandbox validation instead of eval() for security.
   */
  async function runTempQuery() {
    // Check if sandbox is available
    if (!sandboxReady) {
      setUserCodeError("Query sandbox is not available. Please refresh the page.");
      return;
    }

    // Validate code using sandbox
    const validation = validateCode(editorCode);
    if (!validation.valid) {
      setUserCodeError(validation.error || "Invalid code");
      return;
    }

    setEditorCodeFnString(editorCode);
    setUserCodeError(null);
  }

  /**
   * Save the current query (not implemented).
   */
  function saveTempQuery() {
    console.log("save not implemented");
  }

  // Show loading state while sandbox initializes
  if (sandboxReady === null) {
    return (
      <div className="p-6 bg-[--muted]">
        <div className="text-[--muted-foreground]">Initializing query sandbox...</div>
      </div>
    );
  }

  // Show error if sandbox failed to load
  if (sandboxReady === false) {
    return (
      <div className="p-6 bg-[--muted]">
        <div className="text-[--destructive] p-4 bg-[--destructive]/10 rounded">
          <h3 className="font-bold">Query Editor Unavailable</h3>
          <p>
            The query sandbox failed to initialize. This feature requires WebAssembly support. Please try refreshing the
            page or use a different browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link to={`/fp/databases/${name}`} className="font-medium text-[--foreground] hover:underline">
            {name}
          </Link>
          <span className="mx-2">&gt;</span>
          <span>Query</span>
        </nav>
      </div>

      <div className="mb-6 p-4 bg-[--accent]/20 rounded-lg border-2 border-[--accent] shadow-md">
        <h2 className="text-xl font-bold text-[--accent-foreground] mb-2">Query Editor</h2>
        <p className="text-[--muted-foreground]">
          Enter your map function below. This function will be used to query the database.
        </p>
      </div>
      <>
        <EditableCodeHighlight onChange={editorChanged} code={editorCode} language="javascript" />
        <div className="flow-root p-4">
          <button
            className="float-right rounded-lg py-2 px-4 ml-6 bg-[--accent] text-[--accent-foreground] hover:bg-[--accent]/80"
            onClick={runTempQuery}
          >
            Query
          </button>
          <button
            className="float-right rounded-lg py-2 px-4 ml-6 bg-[--muted] text-[--muted-foreground] hover:bg-[--accent]/80"
            onClick={saveTempQuery}
          >
            Save
          </button>
        </div>
      </>
      {userCodeError ? (
        <div className="text-[--destructive] mt-4 p-4 bg-[--destructive]/10 rounded">
          <h3 className="font-bold">Error:</h3>
          <p>{userCodeError}</p>
        </div>
      ) : (
        <QueryDynamicTable mapFn={editorCodeFnString} name={name} />
      )}
    </div>
  );
}

/**
 * Props for the QueryDynamicTable component.
 */
interface QueryDynamicTableProps {
  /** Map function code as a string */
  mapFn: string;
  /** Database name to query */
  name: string;
}

/**
 * Component that executes the map function and displays results.
 * Uses the sandbox for safe code execution.
 *
 * @param props - Component props
 */
function QueryDynamicTable({ mapFn, name }: QueryDynamicTableProps) {
  const { useLiveQuery } = useFireproof(name);
  const [queryResults, setQueryResults] = useState<SandboxDocument[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all documents from the database
  const allDocsResult = useLiveQuery("_id");
  const allDocs = useMemo(() => allDocsResult.docs.filter((doc) => doc) as SandboxDocument[], [allDocsResult.docs]);

  // Execute map function in sandbox when docs or mapFn change
  useEffect(() => {
    let cancelled = false;

    if (allDocs.length === 0) {
      setQueryResults([]);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setQueryError(null);

    executeMapFn(mapFn, allDocs)
      .then((results: MapResult[]) => {
        if (cancelled) return;
        // Extract documents from results
        const docs = results
          .map((r: MapResult) => r.value)
          .filter((v: unknown): v is SandboxDocument => v !== null && typeof v === "object");
        setQueryResults(docs);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setQueryError(error.message);
        setQueryResults([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapFn, allDocs]);

  if (isLoading) {
    return <div className="text-[--muted-foreground] p-4">Executing query...</div>;
  }

  if (queryError) {
    return (
      <div className="text-[--destructive] mt-4 p-4 bg-[--destructive]/10 rounded">
        <h3 className="font-bold">Query Error:</h3>
        <p>{queryError}</p>
      </div>
    );
  }

  const headers = headersForDocs(queryResults);

  return <DynamicTable headers={headers} th="key" link={["_id"]} rows={queryResults as TableRow[]} dbName={name} />;
}
