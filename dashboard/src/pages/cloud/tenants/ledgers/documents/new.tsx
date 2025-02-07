import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { EditableCodeHighlight } from "../../../../../components/CodeHighlight.tsx";

export function NewLedgerDocument() {
  const { tenantId, ledgerId } = useParams();
  const navigate = useNavigate();

  const { database } = useFireproof(ledgerId || "");
  const [docToSave, setDocToSave] = useState<string>(JSON.stringify({}, null, 2));
  const [needsSave, setNeedsSave] = useState(false);

  async function saveDocument() {
    try {
      const data = JSON.parse(docToSave);
      const resp = await database.put(data);
      navigate(`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`);
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  }

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid);
    setDocToSave(code);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Document Data</h3>
        <EditableCodeHighlight onChange={editorChanged} code={docToSave} />
      </div>

      <div className="flex space-x-4">
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
        <Link
          to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`}
          className="inline-flex items-center justify-center rounded bg-[--background] border border-[--border] px-3 py-2 text-sm font-semibold text-[--foreground] shadow-sm hover:bg-[--background]/80 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
