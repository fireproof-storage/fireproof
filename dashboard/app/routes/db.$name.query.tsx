import { useState } from "react";
import { useParams } from "@remix-run/react";
import { headersForDocs } from "../components/dynamicTableHelpers";
import DynamicTable from "../components/DynamicTable";
import {
  CodeHighlight,
  EditableCodeHighlight,
} from "../components/CodeHighlight";
import { useFireproof } from "use-fireproof";

export default function Query() {
  const { name } = useParams();
  const { useLiveQuery } = useFireproof(name);
  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);
  const headers = headersForDocs(docs);

  const emptyMap = "function(doc, map) { map(doc._id, doc) }";
  const [editorCode, setEditorCode] = useState<string>(emptyMap);

  function editorChanged({ code }: { code: string }) {
    setEditorCode(code);
  }

  function runTempQuery() {
    // Implement the logic to run the temporary query
  }

  function saveTempQuery() {
    // Implement the logic to save the temporary query
  }

  return (
    <div className="p-6 dark:bg-slate-800 bg-white">
      <h2 className="text-2xl dark:text-white text-black">Index</h2>
      {editorCode ? (
        <CodeHighlight code={editorCode} />
      ) : (
        <>
          <EditableCodeHighlight
            onChange={editorChanged}
            code={emptyMap}
            language="js"
          />
          <div className="flow-root p-4">
            <button
              className="float-right rounded-lg py-2 px-4 ml-6 dark:bg-slate-500 bg-gray-300 dark:hover:bg-yellow-800 hover:bg-yellow-500"
              onClick={runTempQuery}
            >
              Query
            </button>
            <button
              className="float-right rounded-lg py-2 px-4 ml-6 dark:bg-slate-700 bg-gray-500 dark:hover:bg-yellow-800 hover:bg-yellow-500"
              onClick={saveTempQuery}
            >
              Save
            </button>
          </div>
        </>
      )}
      <DynamicTable headers={headers} th="key" link={["id"]} rows={docs} />
    </div>
  );
}
