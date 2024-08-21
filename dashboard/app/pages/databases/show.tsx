import { Link, useParams } from "@remix-run/react";
import { useFireproof } from "use-fireproof";
import { headersForDocs } from "../../components/dynamicTableHelpers";

export default function Show() {
  const { name } = useParams();
  return <TableView key={name} name={name} />;
}

function TableView({ name }) {
  const { useLiveQuery } = useFireproof(name);
  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);

  const headers = headersForDocs(docs);

  const handleDeleteDatabase = () => {
    if (
      window.confirm(`Are you sure you want to delete the database "${name}"?`)
    ) {
      indexedDB.deleteDatabase(`fp.${name}`);
      window.location = "/";
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">All Documents</h2>
        <div className="flex space-x-2">
          <Link
            to={`/fp/databases/${name}/docs/new`}
            className="inline-flex items-center justify-center rounded-md bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            New Document
          </Link>
          <button
            onClick={handleDeleteDatabase}
            className="inline-flex items-center justify-center rounded-md bg-[--destructive] px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-[--destructive]/80"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Delete Database
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[--muted] text-muted-foreground">
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Document</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr
                key={doc._id}
                className="border-b border-[--border] hover:bg-[--muted]"
              >
                <td className="p-2 font-semibold">{doc._id}</td>
                <td className="p-2">
                  <pre className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {JSON.stringify(doc, null, 2)}
                  </pre>
                </td>
                <td className="p-2 text-right">
                  <Link
                    to={`/fp/databases/${name}/docs/${doc._id}`}
                    className="inline-flex items-center justify-center rounded-md bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80 mr-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteDocument(doc._id)}
                    className="inline-flex items-center justify-center rounded-md bg-[--destructive] px-3 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-[--destructive]/80"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // return (
  //   <div className="p-4" key={name}>
  //     <h3 className="text-lg font-semibold mb-2">All Documents:</h3>
  //     <DynamicTable dbName={name} headers={headers} rows={docs} />
  //   </div>
  // );
}
