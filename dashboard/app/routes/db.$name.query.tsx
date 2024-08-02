import { useState } from "react";
import { useParams } from "@remix-run/react";
import { headersForDocs } from "../components/dynamicTableHelpers";
import DynamicTable from "../components/DynamicTable";
import {
  EditableCodeHighlight,
} from "../components/CodeHighlight";
import { useFireproof, MapFn } from "use-fireproof";

type AnyMapFn = MapFn<object>;


// function evalFn(fnString: string) {
//   let mapFn
//   // try {
//   eval(`mapFn = ${fnString}`)
//   return mapFn as unknown as AnyMapFn
//   // } catch (e) {
//   //   console.error(e)
//   // }
// }

export default function Query() {
  const { name } = useParams();
  if (!name) throw new Error("No database name provided");
  // const { database } = useFireproof(name);


  const emptyMap = `
  (doc, emit) => {
    emit(doc._id, doc) 
  }
  `;

  const [editorCode, setEditorCode] = useState<string>(emptyMap);
  // const [editorCodeFn, setEditorCodeFn] = useState<AnyMapFn>(() => evalFn(editorCode));
  const [editorCodeFnString, setEditorCodeFnString] = useState<string>(() => editorCode);

  
  function editorChanged({ code }: { code: string }) {
    setEditorCode(code);
  }

  async function runTempQuery() {
    setEditorCodeFnString(editorCode)
    // setEditorCodeFn(evalFn(editorCode))
  }

  function saveTempQuery() {
    // Implement the logic to save the temporary query
    console.log("save not implemented")
  }

  return (
    <div className="p-6 dark:bg-slate-800 bg-white">
      <h2 className="text-2xl dark:text-white text-black">Index</h2>

      <>
        <EditableCodeHighlight
          onChange={editorChanged}
          code={editorCode}
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
      <QueryDynamicTable mapFn={editorCodeFnString} name={name} />
      {/* <DynamicTable headers={headers} th="key" link={["id"]} rows={docs} /> */}
    </div>
  );
}



function QueryDynamicTable({ mapFn, name }: { mapFn: string, name: string }) {
  const { useLiveQuery } = useFireproof(name);
// console.log(mapFn)
  const allDocs = useLiveQuery(mapFn);
  const docs = allDocs.docs.filter((doc) => doc);
  const headers = headersForDocs(docs);

  return <>
  {/* <pre>{mapFn.toString()}</pre> */}
  <DynamicTable headers={headers} th="key" link={["id"]} rows={docs} /></>;
}

