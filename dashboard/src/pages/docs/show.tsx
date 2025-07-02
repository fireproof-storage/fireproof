import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { CodeHighlight, EditableCodeHighlight } from "../../components/CodeHighlight.jsx";
import { useFireproof } from "use-fireproof";

export function DocsShow() {
  const { name } = useParams();
  const navigate = useNavigate();
  let { id: _id } = useParams();
  _id = _id === "new" ? undefined : _id;

  const { useDocument, database } = useFireproof(name);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [doc] = useDocument(() => ({ _id: _id! }));
  const [docToSave, setDocToSave] = useState<string>(JSON.stringify(doc, null, 2));
  const [needsSave, setNeedsSave] = useState(false);

  async function saveDocument(_id?: string) {
    const data = JSON.parse(docToSave);
    const resp = await database.put({ _id, ...data });
    if (!_id) {
      navigate(`/fp/databases/${name}/docs/${resp.id}`);
      return;
    }
    setNeedsSave(false);
  }

  async function deleteDocument(_id: string) {
    alert("Are you sure?");
    await database.del(_id);
    navigate(-1);
  }

  function editorChanged({ code, valid }: { code: string; valid: boolean }) {
    setNeedsSave(valid);
    setDocToSave(() => code);
  }

  // const { _id: id, ...data } = doc;
  // const title = id ? `Edit document: ${_id}` : "Create new document";

  const idFirstMeta = { _id };

  return (
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link to={`/fp/databases/${name}`} className="font-medium text-[--foreground] hover:underline">
            {name}
          </Link>
          <span className="mx-2">&gt;</span>
          <span>{_id ? `Document: ${_id}` : "New Document"}</span>
        </nav>
      </div>
      <h3>Editable data fields</h3>
      <EditableCodeHighlight onChange={editorChanged} code={JSON.stringify(doc, null, 2)} />
      <div className="flex space-x-4 mt-4">
        <button
          onClick={() => {
            saveDocument(_id);
          }}
          className={`${
            needsSave
              ? "bg-[--accent] hover:bg-[--accent]/80 text-accent-foreground"
              : "bg-[--accent] hover:bg-[--accent]/80 text-accent-foreground opacity-50"
          } inline-flex items-center justify-center rounded px-3 py-2 text-sm font-semibold shadow-sm transition-colors`}
        >
          Save
        </button>
        {_id && (
          <button
            onClick={() => deleteDocument(_id)}
            className="inline-flex items-center justify-center rounded bg-[--destructive] px-3 py-2 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-[--destructive]/80 transition-colors"
          >
            Delete
          </button>
        )}
        <Link
          to={`/fp/databases/${name}`}
          className="inline-flex items-center justify-center rounded bg-[--background] border border-[--border] px-3 py-2 text-sm font-semibold text-[--foreground] shadow-sm hover:bg-[--background]/80 transition-colors"
        >
          Cancel
        </Link>
      </div>
      <h3 className="mt-4">Fireproof metadata</h3>
      <CodeHighlight code={JSON.stringify(idFirstMeta, null, 2)} />
    </div>
  );
}
