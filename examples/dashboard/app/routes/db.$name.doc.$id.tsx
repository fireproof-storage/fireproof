import { Link } from "@remix-run/react";
import { useParams } from "react-router-dom";
import { DocBase, useFireproof } from "use-fireproof";
import { useState } from "react";

export default function Document() {
  const { name, id } = useParams();
  const { useDocument, database } = useFireproof(name);
  const [isEditing, setIsEditing] = useState(false);

  const [doc] = useDocument(() => ({ _id: id! }));

  const handleSave = (updatedDoc: DocBase) => {
    setIsEditing(false);
    database.put(updatedDoc);
  };
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">
        Document: <code className="bg-gray-200 p-1 rounded">{id}</code>
      </h2>
      <p className="mb-4">
        Database: <Link to={`/db/${name}`} className="text-blue-500 underline">{name}</Link>
      </p>
      {isEditing ? (
        <EditableArea doc={doc} onSave={handleSave} />
      ) : (
        <div>
          <pre className="bg-gray-100 p-2 rounded mb-2">
            <code>{JSON.stringify(doc, null, 2)}</code>
          </pre>
          <button onClick={() => setIsEditing(true)} className="bg-blue-500 text-white p-2">
            Edit Document
          </button>
        </div>
      )}
    </div>
  );
}

export function EditableArea({ doc, onSave }: { doc: DocBase, onSave: (updatedDoc: DocBase) => void }) {
  const [jsonInput, setJsonInput] = useState(JSON.stringify(doc, null, 2));
  const [error, setError] = useState("");

  const handleSaveClick = () => {
    try {
      const parsedJson = JSON.parse(jsonInput);
      onSave(parsedJson);
      setError("");
    } catch (e) {
      setError("Invalid JSON");
    }
  };

  return (
    <div>
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder="Enter JSON here"
        className="border p-2 w-full h-40 mb-2"
      />
      {error && <p className="text-red-500 mb-2">{error}</p>}
      <button onClick={handleSaveClick} className="bg-blue-500 text-white p-2">
        Save Document
      </button>
    </div>
  );
}