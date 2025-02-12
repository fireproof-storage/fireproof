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
      <h2 className="mt-6 mb-[20px]">Editable data fields</h2>
      <EditableCodeHighlight onChange={editorChanged} code={JSON.stringify(data, null, 2)} />
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
      <div className="flex items-center mb-[20px]">
        <h2>Fireproof metadata</h2>
        <div className="group relative text-fp-dec-02 cursor-pointer p-2 hover:text-fp-s">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M8.00001 1C9.85666 1 11.6373 1.73755 12.9501 3.0504C14.263 4.36325 15.0005 6.14385 15.0005 8.0005C15.0005 9.85715 14.263 11.6378 12.9501 12.9506C11.6373 14.2634 9.85666 15.001 8.00001 15.001C6.14336 15.001 4.36276 14.2634 3.04991 12.9506C1.73706 11.6378 0.999512 9.85715 0.999512 8.0005C0.999512 6.14385 1.73706 4.36325 3.04991 3.0504C4.36276 1.73755 6.14336 1 8.00001 1ZM9.05001 5.298C9.57001 5.298 9.99201 4.937 9.99201 4.402C9.99201 3.867 9.56901 3.506 9.05001 3.506C8.53001 3.506 8.11001 3.867 8.11001 4.402C8.11001 4.937 8.53001 5.298 9.05001 5.298ZM9.23301 10.925C9.23301 10.818 9.27001 10.54 9.24901 10.382L8.42701 11.328C8.25701 11.507 8.04401 11.631 7.94401 11.598C7.89864 11.5813 7.86072 11.549 7.83707 11.5068C7.81342 11.4646 7.8056 11.4154 7.81501 11.368L9.18501 7.04C9.29701 6.491 8.98901 5.99 8.33601 5.926C7.64701 5.926 6.63301 6.625 6.01601 7.512C6.01601 7.618 5.99601 7.882 6.01701 8.04L6.83801 7.093C7.00801 6.916 7.20601 6.791 7.30601 6.825C7.35528 6.84268 7.39565 6.87898 7.41846 6.92609C7.44127 6.97321 7.4447 7.02739 7.42801 7.077L6.07001 11.384C5.91301 11.888 6.21001 12.382 6.93001 12.494C7.99001 12.494 8.61601 11.812 9.23401 10.925H9.23301Z"
              fill="currentColor"
            />
          </svg>
          <div className="absolute bottom-10 right-[-120px] w-[240px] @[380px]:right-[-180px] @[560px]:bottom-7 @[560px]:left-5 @[560px]:w-[360px] @[380px]:w-[280px] px-5 py-3.5 bg-fp-bg-00 border border-fp-dec-01 text-14 text-fp-s rounded-fp-s hidden group-hover:block">
            <span className="text-14-bold text-fp-a-03">The document _id</span> is unique within a ledger, and assigned randomly.
            Use it to specify which record to update.
          </div>
        </div>
      </div>
      <CodeHighlight code={JSON.stringify(idFirstMeta, null, 2)} />
    </div>
  );
}
