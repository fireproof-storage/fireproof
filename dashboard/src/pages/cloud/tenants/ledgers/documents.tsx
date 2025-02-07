import { rawConnect } from "@fireproof/cloud";
import { useContext } from "react";
import { Link, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { AppContext } from "../../../../app-context.tsx";
import DynamicTable from "../../../../components/DynamicTable.tsx";
import { headersForDocs } from "../../../../components/dynamicTableHelpers.ts";
import { DEFAULT_ENDPOINT } from "../../../../helpers.ts";

interface Document {
  _id: string;
  [key: string]: unknown;
}

export function LedgerDocuments() {
  const { tenantId, ledgerId } = useParams();
  const { cloud } = useContext(AppContext);

  const { useLiveQuery, database } = useFireproof(ledgerId || "");
  // Connect to Fireproof Cloud
  if (database && ledgerId && tenantId) {
    rawConnect(database, `${tenantId}-${ledgerId}`, DEFAULT_ENDPOINT);
  }

  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc): doc is Document => doc !== null);
  const headers = headersForDocs(docs);

  async function handleDeleteDocument(docId: string) {
    if (!database || !window.confirm("Are you sure you want to delete this document?")) {
      return;
    }
    try {
      await database.del(docId);
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  }

  return (
    <div>
      <div className="@container flex justify-between items-start mb-4 gap-4">
        <div className="flex-grow" />
        <div className="flex gap-2 items-center">
          <Link
            to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents/new`}
            className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80 whitespace-nowrap"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            New Document
          </Link>
        </div>
      </div>

      <div>
        {docs.length === 0 ? (
          <div className="mt-4 text-center text-[--muted-foreground]">
            No documents found.{" "}
            <Link
              to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents/new`}
              className="font-semibold text-[--accent] hover:underline"
            >
              Create a new document
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <DynamicTable
            headers={headers}
            th="key"
            link={["_id"]}
            rows={docs}
            hrefFn={(id) => `/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents/${id}`}
            onDelete={handleDeleteDocument}
          />
        )}
      </div>
    </div>
  );
}
