import { useParams } from "@remix-run/react";
import { useState } from "react";
import { useFireproof } from "use-fireproof";

export default function CreateDocument() {
  const { name } = useParams();
  const { database } = useFireproof(name);
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    try {
      const parsedJson = JSON.parse(jsonInput);
      database.put(parsedJson);
      setError("");
      setJsonInput("");
    } catch (e) {
      setError("Invalid JSON");
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Create Document</h2>
      <p className="mb-4">
        Enter the JSON for the new document in the <code className="bg-gray-200 p-1 rounded">{name}</code> database.
      </p>
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder="Enter JSON here"
        className="border p-2 w-full h-40 mb-2"
      />
      {error && <p className="text-red-500 mb-2">{error}</p>}
      <button onClick={handleSave} className="bg-blue-500 text-white p-2">
        Save Document
      </button>
    </div>
  );
}
