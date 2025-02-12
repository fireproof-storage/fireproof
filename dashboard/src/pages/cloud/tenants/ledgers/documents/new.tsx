import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { EditableCodeHighlight } from "../../../../../components/CodeHighlight.tsx";
import { Button } from "../../../../../components/Button.tsx";

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

      <div className="flex gap-[14px] justify-end mt-[14px] mb-[32px]">
        <Button
          variation="secondary"
          tag={Link}
          to={`/fp/cloud/tenants/${tenantId}/ledgers/${ledgerId}/documents`}
          style="min-w-[105px]"
        >
          Back
        </Button>
        <Button
          variation="primary"
          disabled={!needsSave}
          style="min-w-[105px]"
          onClick={() => {
            saveDocument();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
