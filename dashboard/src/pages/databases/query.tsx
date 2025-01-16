import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapFn, useFireproof } from "use-fireproof";
import { EditableCodeHighlight } from "../../components/CodeHighlight.tsx";
import DynamicTable from "../../components/DynamicTable.tsx";
import { headersForDocs } from "../../components/dynamicTableHelpers.ts";

type AnyMapFn = MapFn<object>;

export default function Query() {
  const { name } = useParams();
  if (!name) throw new Error("No database name provided");

  const emptyMap = `(doc, emit) => { emit(doc._id, doc) }`;

  const [editorCode, setEditorCode] = useState<string>(emptyMap);
  const [editorCodeFnString, setEditorCodeFnString] = useState<string>(() => editorCode);
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
      setUserCodeError((error as Error).message);
    }
  }

  function saveTempQuery() {
    console.log("save not implemented");
  }

  return (
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link to={`/fp/databases/${name}`} className="font-medium text-[--foreground] hover:underline">
            {name}
          </Link>
          <span className="mx-2">&gt;</span>
          <span>Query</span>
        </nav>
      </div>

      <div className="mb-6 p-4 bg-[--accent]/20 rounded-lg border-2 border-[--accent] shadow-md">
        <h2 className="text-xl font-bold text-[--accent-foreground] mb-2">Query Editor</h2>
        <p className="text-[--muted-foreground]">
          Enter your map function below. This function will be used to query the database.
        </p>
      </div>
      <>
        <EditableCodeHighlight onChange={editorChanged} code={editorCode} language="javascript" />
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
  console.log(docs);
  const headers = headersForDocs(docs);

  return <DynamicTable headers={headers} th="key" link={["_id"]} rows={docs} dbName={name} />;
}
