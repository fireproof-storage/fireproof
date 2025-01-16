import { rawConnect } from "@fireproof/cloud";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import DynamicTable from "../../components/DynamicTable.tsx";
import { headersForDocs } from "../../components/dynamicTableHelpers.ts";
import { SYNC_DB_NAME, truncateDbName } from "../../helpers.ts";

export default function Show() {
  const { name, endpoint } = useParams();
  if (!name) {
    throw new Error("Name is required");
  }
  return <TableView key={name} name={name} />;
}

function TableView({ name }: { name: string }) {
  const { useLiveQuery, database } = useFireproof(name);
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showQuickstart, setShowQuickstart] = useState(false);
  const [activeTab, setActiveTab] = useState<"react" | "vanilla">("react");
  const connectionInfoRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [connectionInfoPosition, setConnectionInfoPosition] = useState({
    top: 0,
    left: 0,
  });

  const { useLiveQuery: usePetnameLiveQuery, useAllDocs } = useFireproof(SYNC_DB_NAME);

  const myPetnames = usePetnameLiveQuery<{
    localName: string;
    endpoint: string;
    remoteName: string;
  }>("sanitizedRemoteName", {
    key: name,
  });

  console.log(myPetnames);

  const petName = myPetnames.docs[0]?.localName || "";

  let connection, remoteName;
  if (myPetnames.docs.length > 0) {
    const endpoint = myPetnames.docs[0].endpoint;
    remoteName = myPetnames.docs[0].remoteName;
    if (endpoint) {
      connection = rawConnect(database as any, remoteName, endpoint);
    }
  }

  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);

  const headers = headersForDocs(docs);

  const handleDeleteDatabase = async () => {
    if (window.confirm(`Are you sure you want to delete the database "${name}"?`)) {
      const DBDeleteRequest = window.indexedDB.deleteDatabase(`fp.${name}`);

      DBDeleteRequest.onerror = (event) => {
        console.error("Error deleting database.");
      };

      DBDeleteRequest.onsuccess = (event) => {
        console.log("Database deleted successfully");
        console.log(event);
      };
      window.location.href = "/";
    }
  };

  const deleteDocument = async (docId: string) => {
    if (window.confirm(`Are you sure you want to delete this document?`)) {
      await database.del(docId);
    }
  };

  const currentHost = window.location.origin;
  const currentEndpoint = myPetnames.docs[0]?.endpoint || "";
  const currentLocalName = myPetnames.docs[0]?.localName || "";
  const currentRemoteName = myPetnames.docs[0]?.remoteName || "";

  const connectionUrl = `${currentHost}/fp/databases/connect?endpoint=${encodeURIComponent(
    currentEndpoint,
  )}&localName=${encodeURIComponent(currentLocalName)}&remoteName=${encodeURIComponent(currentRemoteName)}`;

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event from bubbling up
    navigator.clipboard.writeText(connectionUrl).then(
      () => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      },
      (err) => console.error("Could not copy text: ", err),
    );
  };

  const handleConnectionInfoClick = () => {
    if (connectionInfoRef.current) {
      const rect = connectionInfoRef.current.getBoundingClientRect();
      setConnectionInfoPosition({
        top: rect.bottom + window.scrollY + 2,
        left: rect.right + window.scrollX - 256, // 256px is width of the popup
      });
    }
    setShowConnectionInfo(!showConnectionInfo);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Don't close if clicking inside the popup
      const popupElement = document.getElementById("connection-info-popup");
      if (popupElement?.contains(event.target as Node)) {
        return;
      }

      if (connectionInfoRef.current && !connectionInfoRef.current.contains(event.target as Node)) {
        setShowConnectionInfo(false);
      }
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="p-6 bg-[--muted]">
      {connection && (
        <div className="mb-4 bg-[--background] border border-[--border] rounded-md p-4">
          <div className="flex items-center cursor-pointer" onClick={() => setShowQuickstart(!showQuickstart)}>
            <h3 className="font-bold text-sm flex-grow">Quickstart</h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transform transition-transform ${showQuickstart ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          {showQuickstart && (
            <div className="mt-4">
              <div className="flex border-b border-[--border] mb-4">
                <button
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === "react" ? "border-b-2 border-[--accent] text-[--accent]" : "text-[--muted-foreground]"
                  }`}
                  onClick={() => setActiveTab("react")}
                >
                  React
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === "vanilla" ? "border-b-2 border-[--accent] text-[--accent]" : "text-[--muted-foreground]"
                  }`}
                  onClick={() => setActiveTab("vanilla")}
                >
                  Vanilla JS
                </button>
              </div>

              {activeTab === "react" && (
                <pre className="bg-[--muted] p-2 rounded text-xs overflow-x-auto">
                  {`
import { useFireproof } from "use-fireproof";
import { connect } from "@fireproof/cloud";

export default function App() {
  const { database, useLiveQuery, useDocument } = useFireproof("my_db");
  connect(database, '${remoteName}');
  const { docs } = useLiveQuery("_id");

  const [newDoc, setNewDoc, saveNewDoc] = useDocument({ input: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newDoc.input) {
      await saveNewDoc();
      setNewDoc(); // Reset for new entry
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={newDoc.input}
          onChange={(e) => setNewDoc({ input: e.target.value })}
        />
        <button>Add</button>
      </form>
      <ul>
        {docs.map((doc) => (
          <li key={doc._id}>{JSON.stringify(doc)}</li>
        ))}
      </ul>
    </div>
  );
}`}
                </pre>
              )}

              {activeTab === "vanilla" && <pre className="bg-[--muted] p-2 rounded text-xs overflow-x-auto">{``}</pre>}
            </div>
          )}
        </div>
      )}

      <div className="@container flex justify-between items-start mb-4 gap-4">
        <nav className="text-base max-[500px]:text-sm text-[--muted-foreground] flex-grow flex items-center flex-wrap">
          <Link to={`/fp/databases/${name}`} className="font-medium text-[--foreground] hover:underline truncate max-w-[150px]">
            {truncateDbName(name, 12)}
          </Link>
          {petName && (
            <>
              <span className="mx-1">&gt;</span>
              <span className="truncate max-w-[80px]">{petName}</span>
            </>
          )}
          <span className="mx-1">&gt;</span>
          <span className="truncate">All Documents ({docs.length})</span>
        </nav>

        <div className="flex gap-2 items-center max-[500px]:self-auto">
          {connection && (
            <div className="relative" ref={connectionInfoRef}>
              <div
                onClick={handleConnectionInfoClick}
                className="cursor-pointer inline-flex items-center justify-center rounded bg-[--background] px-3 py-2 text-sm font-medium text-[--foreground] transition-colors hover:bg-[--background]/80 border border-[--border] whitespace-nowrap"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Connected
              </div>
              {showConnectionInfo &&
                createPortal(
                  <div
                    id="connection-info-popup"
                    className="fixed bg-[--background] border border-[--border] rounded-md shadow-lg z-[9999] w-64"
                    style={{
                      top: connectionInfoPosition.top + "px",
                      left: connectionInfoPosition.left + "px",
                    }}
                  >
                    <div className="p-4">
                      <h3 className="font-bold mb-2">Share Database:</h3>
                      <button
                        onClick={copyToClipboard}
                        className="w-full p-2 bg-[--accent] text-accent-foreground rounded hover:bg-[--accent]/80 transition-colors"
                      >
                        {copySuccess ? "Copied!" : "Copy Share Link"}
                      </button>
                    </div>
                  </div>,
                  document.body,
                )}
            </div>
          )}

          {/* Mobile Actions Dropdown */}
          <div className="relative block @[575px]:hidden" ref={actionsRef}>
            <button
              onClick={() => setShowActions(!showActions)}
              className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80 whitespace-nowrap"
            >
              Actions
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ml-2 transform transition-transform ${showActions ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {showActions && (
              <div className="absolute right-0 mt-2 w-48 bg-[--background] rounded-md shadow-lg z-10 border border-[--border]">
                <Link
                  to={`/fp/databases/${name}/docs/new`}
                  className="block px-4 py-2 text-sm text-[--foreground] hover:bg-[--muted] hover:text-[--foreground] whitespace-nowrap"
                >
                  New Document
                </Link>
                <button
                  onClick={handleDeleteDatabase}
                  className="w-full text-left px-4 py-2 text-sm text-[--destructive] hover:bg-[--destructive] hover:text-destructive-foreground whitespace-nowrap"
                >
                  Delete Database
                </button>
              </div>
            )}
          </div>

          {/* Desktop Actions */}
          <div className="hidden @[575px]:flex gap-2">
            <Link
              to={`/fp/databases/${name}/docs/new`}
              className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80 whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              New Document
            </Link>
            <button
              onClick={handleDeleteDatabase}
              className="inline-flex items-center justify-center rounded bg-[--destructive] px-3 py-2 text-sm text-destructive-foreground transition-colors hover:bg-[--destructive]/80 whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Delete Database
            </button>
          </div>
        </div>
      </div>

      <div>
        {docs.length === 0 ? (
          <div className="mt-4 text-center text-[--muted-foreground]">
            No documents found.{" "}
            <Link to={`/fp/databases/${name}/docs/new`} className="font-semibold text-[--accent] hover:underline">
              Create a new document
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <DynamicTable headers={headers} th="key" link={["_id"]} rows={docs} dbName={name} onDelete={deleteDocument} />
        )}
      </div>
    </div>
  );
}
