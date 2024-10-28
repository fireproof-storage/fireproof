import { rawConnect } from "@fireproof/cloud";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import DynamicTable from "../../components/DynamicTable";
import { headersForDocs } from "../../components/dynamicTableHelpers";
import { truncateDbName } from "../../layouts/app";

export const DEFAULT_ENDPOINT =
  "fireproof://cloud.fireproof.direct?getBaseUrl=https://storage.fireproof.direct/";
export const SYNC_DB_NAME = "fp_sync";

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
  const connectionInfoRef = useRef<HTMLDivElement>(null);

  const { useLiveQuery: usePetnameLiveQuery, useAllDocs } =
    useFireproof(SYNC_DB_NAME);

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
    if (
      window.confirm(`Are you sure you want to delete the database "${name}"?`)
    ) {
      const DBDeleteRequest = window.indexedDB.deleteDatabase(`fp.${name}`);

      DBDeleteRequest.onerror = (event) => {
        console.error("Error deleting database.");
      };

      DBDeleteRequest.onsuccess = (event) => {
        console.log("Database deleted successfully");

        console.log(event); // should be undefined
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
  const currentRemoteName = myPetnames.docs[0]?.remoteName || "";;

  const connectionUrl = `${currentHost}/fp/databases/connect?endpoint=${encodeURIComponent(
    currentEndpoint
  )}&localName=${encodeURIComponent(
    currentLocalName
  )}&remoteName=${encodeURIComponent(currentRemoteName)}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(connectionUrl).then(
      () => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      },
      (err) => console.error("Could not copy text: ", err)
    );
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        connectionInfoRef.current &&
        !connectionInfoRef.current.contains(event.target as Node)
      ) {
        setShowConnectionInfo(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link
            to={`/fp/databases/${name}`}
            className="font-medium text-[--foreground] hover:underline"
          >
            {truncateDbName(name, 20)}
          </Link>
          {petName && <span className="mx-2">&gt; {petName}</span>}
          <span> &gt; All Documents ({docs.length})</span>
        </nav>
        <div className="flex space-x-2">
          {connection && (
            <div className="relative" ref={connectionInfoRef}>
              <div
                onClick={() => setShowConnectionInfo(!showConnectionInfo)}
                className="cursor-pointer inline-flex items-center justify-center rounded bg-[--background] px-3 py-2 text-sm font-medium text-[--foreground] transition-colors hover:bg-[--background]/80 border border-[--border]"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Connected
              </div>
              {showConnectionInfo && (
                <div className="absolute right-0 mt-2 w-96 bg-[--background] border border-[--border] rounded-md shadow-lg z-10">
                  <div className="p-4">
                    <h3 className="font-bold mb-2">Share:</h3>
                    <button
                      onClick={copyToClipboard}
                      className="w-full p-2 bg-[--accent] text-accent-foreground rounded hover:bg-[--accent]/80 transition-colors"
                    >
                      {copySuccess ? "Copied!" : "Copy Share Link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <Link
            to={`/fp/databases/${name}/docs/new`}
            className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
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
            className="inline-flex items-center justify-center rounded bg-[--destructive] px-3 py-2 text-sm text-destructive-foreground transition-colors hover:bg-[--destructive]/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
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
      <DynamicTable
        headers={headers}
        th="key"
        link={["_id"]}
        rows={docs}
        dbName={name}
        onDelete={deleteDocument}
      />
    </div>
  );
}
