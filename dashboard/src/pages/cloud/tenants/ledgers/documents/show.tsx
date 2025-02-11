import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { Button } from "../../../../../components/Button.tsx";
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
        <Button variation="primary" onClick={saveDocument} disabled={!needsSave}>
          Save
        </Button>
        <Button variation="destructive" onClick={deleteDocument}>
          Delete
        </Button>
        <Button variation="secondary" tag={Link} to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`}>
          Cancel
        </Button>
      </div>

      <h3 className="text-lg font-medium mt-4 mb-2">Fireproof metadata</h3>
      <CodeHighlight code={JSON.stringify(idFirstMeta, null, 2)} />
    </div>
  );
}
