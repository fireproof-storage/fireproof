import { useParams } from "@remix-run/react";
import { Outlet } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { Sidebar } from "~/components/Sidebar";

export default function Database() {
  const { name } = useParams();
  const { useLiveQuery, database } = useFireproof(name);
  const head = database._crdt.clock.head.map((cid) => cid.toString());

  const allDocs = useLiveQuery("_id");
  const docs = allDocs.docs.filter((doc) => doc);
  return (
    <div className="flex h-screen">
      <div className="w-56 flex-shrink-0">
        {" "}
        {/* Fixed width of 16rem (64 units) */}
        <Sidebar />
      </div>
      <div className="flex-1 p-4 overflow-auto">
        {" "}
        {/* Flex-grow to take remaining space and allow scrolling */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h2 className="text-xl font-bold mb-2">
              Database:{" "}
              <code className="bg-gray-200 dark:bg-gray-700 p-1 rounded">
                {name}
              </code>
            </h2>
            <p className="mb-4">There are {docs.length} documents</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Head:</h3>
            <pre className="bg-gray-100 dark:bg-gray-800 p-2 mb-2 rounded overflow-scroll">
              <code className="text-xs text-black dark:text-white">
                {JSON.stringify(head, null, 2)}
              </code>
            </pre>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
