import { useParams } from "@remix-run/react";
import { headersForDocs } from "../components/dynamicTableHelpers";
import DynamicTable from "../components/DynamicTable";
import { useFireproof } from "use-fireproof";

export default function DbInfo() {
  const { name } = useParams();
  const { useLiveQuery, database } = useFireproof(name);
  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);
  const head = database._crdt.clock.head.map((cid) => cid.toString());
  const headers = headersForDocs(docs);

  return (
    <div className="p-4">

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-xl font-bold mb-2">
            Database: <code className="bg-gray-200 dark:bg-gray-700 p-1 rounded">{name}</code>
          </h2>
          <p className="mb-4">There are {docs.length} documents</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Head:</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-2 mb-2 rounded overflow-scroll">
            <code className="text-xs text-black dark:text-white">{JSON.stringify(head, null, 2)}</code>
          </pre>
        </div>
      </div>


      <h3 className="text-lg font-semibold mb-2">All Documents:</h3>
      <DynamicTable dbName={name} headers={headers} rows={docs} />
    </div>
  );
}
