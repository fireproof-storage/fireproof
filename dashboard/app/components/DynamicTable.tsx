/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

export default function DynamicTable({
  hrefFn,
  dbName,
  headers,
  rows,
  th = "_id",
  link = ["_id"],
}: any) {
  const [columnLinks, setColumnLinks] = useState(link);

  function toggleColumnLinks(header: string) {
    if (columnLinks.includes(header)) {
      setColumnLinks(columnLinks.filter((h: string) => h !== header));
    } else {
      setColumnLinks([...columnLinks, header]);
    }
  }

  return (
    <div className="relative overflow-x-auto dark mt-4">
      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr key={"header" + Math.random()}>
            {headers.map((header: string) => (
              <th
                key={header}
                onClick={() => toggleColumnLinks(header)}
                scope="col"
                className="px-6 py-3"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((fields: any) => (
            <tr
              key={fields._id || JSON.stringify(fields)}
              className="bg-white border-b dark:bg-gray-800 dark:border-gray-700"
            >
              {headers.map((header: string) =>
                header === th ? (
                  <th
                    key={header}
                    scope="row"
                    className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white"
                  >
                    <TableCell
                      hrefFn={hrefFn}
                      dbName={dbName}
                      link={columnLinks.includes(header)}
                      label={fields[header]}
                    />
                  </th>
                ) : (
                  <td key={header} className="px-6 py-4">
                    <TableCell
                      hrefFn={hrefFn}
                      dbName={dbName}
                      link={columnLinks.includes(header)}
                      label={fields[header]}
                    />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCell({
  label,
  link = false,
  dbName,
  hrefFn,
}: {
  label: any;
  link: boolean;
  dbName: string;
  hrefFn: (label: string) => string;
}) {
  if (link) {
    const href = hrefFn ? hrefFn(label) : `/db/${dbName}/doc/${label}`;
    return (
      <a className="underline" href={href}>
        {formatTableCellContent(label)}
      </a>
    );
  } else {
    return <>{formatTableCellContent(label)}</>;
  }
}

function formatTableCellContent(obj: any) {
  if (typeof obj === "string") return obj;
  return JSON.stringify(obj);
}
