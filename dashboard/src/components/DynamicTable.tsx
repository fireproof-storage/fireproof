/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link } from "react-router-dom";
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
    <div className="relative overflow-x-auto mt-4">
      <table className="w-full text-sm text-left text-[--muted-foreground]">
        <thead className="text-xs text-[--foreground] bg-[--muted]">
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
              className="bg-[--background] border-b border-[--muted]"
            >
              {headers.map((header: string) =>
                header === th ? (
                  <th
                    key={header}
                    scope="row"
                    className="px-6 py-4 font-medium text-[--foreground] whitespace-nowrap"
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
                )
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
    const href = hrefFn
      ? hrefFn(label)
      : `/fp/databases/${dbName}/docs/${label}`;
    return (
      <Link to={href} className="underline text-[--accent]">
        {formatTableCellContent(label)}
      </Link>
    );
  } else {
    return <>{formatTableCellContent(label)}</>;
  }
}

function formatTableCellContent(obj: any) {
  if (typeof obj === "string") return obj;
  return JSON.stringify(obj);
}
