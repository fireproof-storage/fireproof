import { useParams, Link } from "@remix-run/react";
import { useFireproof } from "use-fireproof";

export default function DbInfo() {
  const { name } = useParams();
  const { useLiveQuery, database } = useFireproof(name);
  const allDocs = useLiveQuery("_id");
  const head = database._crdt.clock.head.map((cid) => cid.toString());

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">
        Info: <code className="bg-gray-200 p-1 rounded">{name}</code>
      </h2>
      <p className="mb-4">There are {allDocs.docs.length} documents</p>
      <h3 className="text-lg font-semibold mb-2">Head:</h3>
      <pre className="bg-gray-100 p-2 rounded">
        <code className="text-sm">{JSON.stringify(head, null, 2)}</code>
      </pre>
      <h3 className="text-lg font-semibold mb-2">All Documents:</h3>
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
