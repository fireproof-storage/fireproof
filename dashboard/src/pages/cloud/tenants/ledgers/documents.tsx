import React, { useContext } from "react";
// import { rawConnect } from "@fireproof/cloud";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toCloud, useFireproof } from "use-fireproof";
import { AppContext } from "../../../../app-context.jsx";
import { Button } from "../../../../components/Button.jsx";
import { DynamicTable } from "../../../../components/DynamicTable.jsx";
import { headersForDocs } from "../../../../components/dynamicTableHelpers.js";
import { SimpleTokenStrategy } from "../../../../../../core/gateways/cloud/to-cloud.js";
// import { DEFAULT_ENDPOINT } from "../../../../helpers.js";

interface Document {
  _id: string;
  [key: string]: unknown;
}

export function LedgerDocuments() {
  const { tenantId, ledgerId } = useParams();
  const { cloud } = useContext(AppContext);
  const cloudToken = cloud.getCloudToken();

  // Wait for token before rendering the main component
  if (cloudToken.isPending) {
    return <div>Loading...</div>;
  }
  if (!cloudToken.data) {
    return <div>Not found</div>;
  }

  return <LedgerDocumentsContent tenantId={tenantId} ledgerId={ledgerId} token={cloudToken.data.token} />;
}

function LedgerDocumentsContent({ tenantId, ledgerId, token }: { tenantId?: string; ledgerId?: string; token: string }) {
  const navigate = useNavigate();

  const { useLiveQuery, database, attach } = useFireproof(ledgerId || "", {
    attach: toCloud({
      urls: { base: "fpcloud://localhost:8787?protocol=ws" },
      tenant: tenantId,
      ledger: ledgerId,
      strategy: new SimpleTokenStrategy(token),
    }),
  });

  console.log(attach.ctx);

  const allDocs = useLiveQuery<Document>("_id");
  const docs = allDocs.docs.filter((doc) => !!doc);
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
          <Button variation="primary" onClick={() => navigate(`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents/new`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 3.5C9 2.94772 8.55228 2.5 8 2.5C7.44772 2.5 7 2.94772 7 3.5V7H3.5C2.94772 7 2.5 7.44772 2.5 8C2.5 8.55228 2.94772 9 3.5 9H7V12.5C7 13.0523 7.44772 13.5 8 13.5C8.55228 13.5 9 13.0523 9 12.5V9H12.5C13.0523 9 13.5 8.55228 13.5 8C13.5 7.44772 13.0523 7 12.5 7H9V3.5Z"
                fill="currentColor"
              />
            </svg>
            New Document
          </Button>
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
