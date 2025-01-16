import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type DocBase, useFireproof } from "use-fireproof";
import DynamicTable from "../../components/DynamicTable.tsx";
import { headersForDocs } from "../../components/dynamicTableHelpers.ts";

export default function ChangesHistory() {
  const { name } = useParams();
  const { database } = useFireproof(name);

  const [history, setHistory] = useState({ rows: [] } as {
    rows: { key: string; value: DocBase }[];
  });

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
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link to={`/fp/databases/${name}`} className="font-medium text-[--foreground] hover:underline">
            {name}
          </Link>
          <span className="mx-2">&gt;</span>
          <span>History</span>
        </nav>
      </div>
      <DynamicTable dbName={name} headers={headers} rows={rows} />
    </div>
  );
}
