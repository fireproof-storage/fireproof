// import { cloudConnect } from "@fireproof/partykit";
import React from "react";
import { Link, useParams } from "react-router-dom";
import { fireproof, useFireproof } from "use-fireproof";
import DynamicTable from "../../components/DynamicTable";
import { headersForDocs } from "../../components/dynamicTableHelpers";

export default function Show() {
  const { name } = useParams();
  return <TableView key={name} name={name} />;
}

function TableView({ name }: { name: string }) {
  const { useLiveQuery, database } = useFireproof(name);
  const petnames = fireproof("petname.mappings");

  const getPetname = () => {
    const { rows } = await petnames.query("localName", {key : name, includeDocs: true})
    if (rows.length) {
      // todo handle more than one match
      const { remoteName } = rows[0].doc
      return { remoteName: doc.remoteName, firstConnect: false }
    } else {
      return {}
    }
  };

  getPetname().then((result) => {
    // cloudConnect(database);
  });

  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);

  const headers = headersForDocs(docs);

  const handleDeleteDatabase = async () => {
    if (
      window.confirm(`Are you sure you want to delete the database "${name}"?`)
    ) {
      const DBDeleteRequest = window.indexedDB.deleteDatabase(`fp.${name}`);

      DBDeleteRequest.onerror = (event) => {
        console.error("Error deleting database.");
      };

      DBDeleteRequest.onsuccess = (event) => {
        console.log("Database deleted successfully");

        console.log(event); // should be undefined
      };
      window.location.href = "/";
    }
  };

  const deleteDocument = async (docId: string) => {
    if (window.confirm(`Are you sure you want to delete this document?`)) {
      await database.del(docId);
    }
  };

  return (
    <div className="p-6 bg-[--muted]">
      <div className="flex justify-between items-center mb-4">
        <nav className="text-lg text-[--muted-foreground]">
          <Link
            to={`/fp/databases/${name}`}
            className="font-medium text-[--foreground] hover:underline"
          >
            {name}
          </Link>
          <span className="mx-2">&gt;</span>
          <span>All Documents ({docs.length})</span>
        </nav>
        <div className="flex space-x-2">
          <Link
            to={`/fp/databases/${name}/docs/new`}
            className="inline-flex items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80"
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
            className="inline-flex items-center justify-center rounded bg-[--destructive] px-3 py-2 text-sm text-destructive-foreground transition-colors hover:bg-[--destructive]/80"
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
      <DynamicTable
        headers={headers}
        th="key"
        link={["_id"]}
        rows={docs}
        dbName={name}
        onDelete={deleteDocument}
      />
    </div>
  );
}
