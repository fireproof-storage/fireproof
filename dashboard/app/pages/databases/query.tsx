import { useParams } from "@remix-run/react";
import { useState } from "react";
import { MapFn, useFireproof } from "use-fireproof";
import { EditableCodeHighlight } from "~/components/CodeHighlight";
import DynamicTable from "~/components/DynamicTable";
import { headersForDocs } from "~/components/dynamicTableHelpers";

type AnyMapFn = MapFn<object>;

export default function Query() {
  const { name } = useParams();
  if (!name) throw new Error("No database name provided");

  const emptyMap = `
  (doc, emit) => {
    emit(doc._id, doc) 
  }
  `;

  const [editorCode, setEditorCode] = useState<string>(emptyMap);
  const [editorCodeFnString, setEditorCodeFnString] = useState<string>(
    () => editorCode
  );
  const [userCodeError, setUserCodeError] = useState<string | null>(null);

  function editorChanged({ code }: { code: string }) {
    setEditorCode(code);
  }

  async function runTempQuery() {
    try {
      // Try to evaluate the function to check for  errors
      eval(`(${editorCode})`);
      setEditorCodeFnString(editorCode);
      setUserCodeError(null);
    } catch (error) {
      setUserCodeError(error.message);
    }
  }

  function saveTempQuery() {
    console.log("save not implemented");
  }

  return (
    <div className="p-6 bg-[--muted]">
      <h2 className="text-2xl text-[--foreground]">Index</h2>

      <>
        <EditableCodeHighlight
          onChange={editorChanged}
          code={editorCode}
          language="js"
        />
        <div className="flow-root p-4">
          <button
            className="float-right rounded-lg py-2 px-4 ml-6 bg-[--accent] text-[--accent-foreground] hover:bg-[--accent]/80"
            onClick={runTempQuery}
          >
            Query
          </button>
          <button
            className="float-right rounded-lg py-2 px-4 ml-6 bg-[--muted] text-[--muted-foreground] hover:bg-[--accent]/80"
            onClick={saveTempQuery}
          >
            Save
          </button>
        </div>
      </>
      {userCodeError ? (
        <div className="text-[--destructive] mt-4 p-4 bg-[--destructive]/10 rounded">
          <h3 className="font-bold">Error:</h3>
          <p>{userCodeError}</p>
        </div>
      ) : (
        <QueryDynamicTable mapFn={editorCodeFnString} name={name} />
      )}
    </div>
  );
}

function QueryDynamicTable({ mapFn, name }: { mapFn: string; name: string }) {
  const { useLiveQuery } = useFireproof(name);
  const allDocs = useLiveQuery(eval(`(${mapFn})`));
  const docs = allDocs.docs.filter((doc) => doc);
  const headers = headersForDocs(docs);

  return <DynamicTable headers={headers} th="key" link={["id"]} rows={docs} />;
}
