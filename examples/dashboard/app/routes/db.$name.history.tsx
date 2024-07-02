import { useState, useEffect } from "react";
import { useParams } from "@remix-run/react";
import { Link } from "react-router-dom";
import { DocBase, useFireproof } from "use-fireproof";


export default function AddDocuments() {
  const { name } = useParams();
  const { database } = useFireproof(name);

  const [history, setHistory] = useState({ rows: [] } as { rows: { key: string; value: DocBase }[] });

  useEffect(() => {
    const handleChanges = async () => {
      const changes = await database.changes()
      setHistory(changes);
    };

    void handleChanges()
    return database.subscribe(handleChanges);
  }, [database]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">
        Recent Changes in <code className="bg-gray-200 p-1 rounded">{name}</code> Database
      </h2>
      <p className="mb-4">These are the recent changes in the database.</p>
      <ul>
        {history.rows.map(({ key }) => (
          <li key={key} className="mb-2">
            <Link to={`/db/${name}/doc/${key}`} className="text-blue-500 underline">
              {key}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}