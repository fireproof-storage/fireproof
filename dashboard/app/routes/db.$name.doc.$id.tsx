import { useState } from "react";
import { useParams, Link } from "@remix-run/react";
import { DocBase, useFireproof } from "use-fireproof";
import { themes } from "prism-react-renderer";
import { CodeHighlight, EditableCodeHighlight } from "../components/CodeHighlight";

export default function Document() {
  const { name, id: _id } = useParams();
  const { useDocument, database } = useFireproof(name);

  const [doc] = useDocument(() => ({ _id: _id! }));
  const [docToSave, setDocToSave] = useState<any>(JSON.stringify(doc, null, 2));
  const [needsSave, setNeedsSave] = useState(false);

  async function saveDocument(_id: string) {
    const data = JSON.parse(docToSave);
    const resp = await database.put({ _id, ...data });
    if (!_id) {
      window.location.href = `/db/${name}/doc/${resp.id}`;
    }
    setNeedsSave(false);
  }

  async function deleteDocument(_id: string) {
    await database.del(_id);
    window.location.href = `docs`;
  }

  function editorChanged({ code, valid }: { code: string, valid: boolean }) {
    setNeedsSave(valid);
    setDocToSave(() => code);
  }

  const { _id: id, ...data } = doc;

  const idFirstMeta = { _id };
  const title = _id ? `Edit document: ${_id}` : 'Create new document';

  return (
    <div className="bg-slate-800 p-6">
      <h2 className="text-2xl pb-2">{title}</h2>
      <p className="mb-4">
        Database: <Link to={`/db/${name}`} className="text-blue-500 underline">{name}</Link>
      </p>
      <h3>Editable data fields</h3>
      <EditableCodeHighlight onChange={editorChanged} code={JSON.stringify(data, null, 2)} theme={themes.nightOwl} />
      <button
        onClick={() => {
          saveDocument(_id);
        }}
        className={`${needsSave ? 'bg-blue-500 hover:bg-blue-700 text-white' : 'bg-gray-700 text-gray-400'
          } font-bold py-2 px-4 m-5 rounded`}
      >
        Save
      </button>
      {_id && <button
        onClick={() => deleteDocument(_id)}
        className={`${!!_id ? 'bg-gray-700 hover:bg-orange-700 hover:text-white' : 'bg-gray-700'
          } text-gray-400 font-bold py-2 px-4 my-5 rounded`}
      >
        Delete
      </button>}
      <h3>Fireproof metadata</h3>
      <CodeHighlight code={JSON.stringify(idFirstMeta, null, 2)} theme={themes.oneLight} />
    </div>
  );
}
