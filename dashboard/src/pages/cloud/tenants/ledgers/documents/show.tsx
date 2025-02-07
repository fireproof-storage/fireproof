import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { CodeHighlight, EditableCodeHighlight } from "../../../../../components/CodeHighlight.tsx";

export function ShowLedgerDocument() {
  const { tenantId, ledgerId, documentId } = useParams();
  const navigate = useNavigate();

  const { useDocument, database } = useFireproof(ledgerId || "");
  const [doc] = useDocument(() => ({ _id: documentId }));
  const [docToSave, setDocToSave] = useState<string>(JSON.stringify(doc, null, 2));
  const [needsSave, setNeedsSave] = useState(false);

  async function saveDocument() {
    try {
      const data = JSON.parse(docToSave);
      await database.put({ _id: documentId, ...data });
      setNeedsSave(false);
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  }

  async function deleteDocument() {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      if (!documentId) return;
      await database.del(documentId);
      navigate(`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`);
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  }

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid);
    setDocToSave(code);
  }

  const { _id, ...data } = doc || {};
  const idFirstMeta = { _id: documentId };

  return (
    <div className="p-6 bg-[--muted]">
      <h3 className="text-lg font-medium mb-2">Editable data fields</h3>
      <EditableCodeHighlight onChange={editorChanged} code={JSON.stringify(data, null, 2)} />

      <div className="flex space-x-4 mt-4">
        <button
          type="button"
          onClick={saveDocument}
          disabled={!needsSave}
          className={`
            inline-flex items-center justify-center rounded px-3 py-2 text-sm font-semibold shadow-sm transition-colors
            ${
              needsSave
                ? "bg-[--accent] hover:bg-[--accent]/80 text-accent-foreground"
                : "bg-[--accent] hover:bg-[--accent]/80 text-accent-foreground opacity-50"
            }
          `}
        >
          Save
        </button>
        <button
          type="button"
          onClick={deleteDocument}
          className="inline-flex items-center justify-center rounded bg-[--destructive] px-3 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-[--destructive]/80 transition-colors"
        >
          Delete
        </button>
        <Link
          to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`}
          className="inline-flex items-center justify-center rounded bg-[--background] border border-[--border] px-3 py-2 text-sm font-semibold text-[--foreground] shadow-sm hover:bg-[--background]/80 transition-colors"
        >
          Cancel
        </Link>
      </div>

      <h3 className="text-lg font-medium mt-4 mb-2">Fireproof metadata</h3>
      <CodeHighlight code={JSON.stringify(idFirstMeta, null, 2)} />
    </div>
  );
}
