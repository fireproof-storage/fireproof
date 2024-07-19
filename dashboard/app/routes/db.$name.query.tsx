import { useParams } from "@remix-run/react";
import { headersForDocs } from "../components/dynamicTableHelpers";
import DynamicTable from "../components/DynamicTable";
import { useFireproof } from "use-fireproof";

export default function DbInfo() {
  const { name } = useParams();
  const { useLiveQuery } = useFireproof(name);
  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);
  const headers = headersForDocs(docs);

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">All Documents:</h3>
      <DynamicTable dbName={name} headers={headers} rows={docs} />
    </div>
  );
}
