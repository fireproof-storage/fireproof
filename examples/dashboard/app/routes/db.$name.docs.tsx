import { useParams } from "@remix-run/react";
import { Link } from "react-router-dom";
import { useFireproof } from "use-fireproof";


export default function AddDocuments() {
  const { name } = useParams();
  const { useLiveQuery } = useFireproof(name);
  const allDocs = useLiveQuery('_id')

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">All Documents</h2>
      <p className="mb-4">
        These are all the documents in the <code className="bg-gray-200 p-1 rounded">{name}</code> database.
      </p>
      <ul>
        {allDocs.docs.map(({ _id }) => (
          <li key={_id} className="mb-2">
            <Link to={`/db/${name}/doc/${_id}`} className="text-blue-500 underline">
              {_id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}