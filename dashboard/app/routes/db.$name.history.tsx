import { useState, useEffect } from "react";
import { useParams } from "@remix-run/react";
import { DocBase, useFireproof } from "use-fireproof";
import DynamicTable from "../components/DynamicTable";
import { headersForDocs } from "~/components/dynamicTableHelpers";

export default function ChangesHistory() {
  const { name } = useParams();
  const { database } = useFireproof(name);

  const [history, setHistory] = useState({ rows: [] } as { rows: { key: string; value: DocBase }[] });

  useEffect(() => {
    const handleChanges = async () => {
      const changes = await database.changes();
      setHistory(changes);
    };

    void handleChanges();
    return database.subscribe(handleChanges);
  }, [database]);

  const headers = headersForDocs(history.rows.map((row) => row.value));

  const rows = history.rows.map((row) => row.value).reverse();

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">
        Recent Changes in <code className="bg-gray-200 p-1 rounded">{name}</code> Database
      </h2>
      <p className="mb-4">These are the recent changes in the database.</p>
      <DynamicTable dbName={name} headers={headers} rows={rows} />
    </div>
  );
}
