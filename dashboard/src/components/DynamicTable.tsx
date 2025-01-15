/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { useNavigate } from "react-router-dom";

export default function DynamicTable({ hrefFn, dbName, headers, rows, th = "_id", link = ["_id"] }: any) {
  const navigate = useNavigate();

  return (
    <div className="relative mt-4 overflow-x-scroll">
      <table className="w-full text-sm text-left text-[--muted-foreground] border-collapse">
        <thead className="text-xs text-[--foreground] bg-[--muted] relative z-10">
          <tr key={"header" + Math.random()}>
            {headers.map((header: string) => (
              <th key={header} scope="col" className="px-6 py-3 border-b-2 border-[--border]">
                {header === "_id" ? "document id" : header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((fields: any) => (
            <tr
              key={fields._id}
              className="bg-[--background] hover:bg-[--secondary] border-b border-[--border] cursor-pointer"
              onClick={() => {
                navigate(`/fp/databases/${dbName}/docs/${fields._id}`);
              }}
            >
              {headers.map((header: string) =>
                header === th ? (
                  <th key={header} scope="row" className="px-6 py-4 font-medium text-inherit whitespace-nowrap">
                    {formatTableCellContent(fields[header])}
                  </th>
                ) : (
                  <td key={header} className="px-6 py-4">
                    {formatTableCellContent(fields[header])}
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

function formatTableCellContent(obj: any) {
  if (typeof obj === "string") return obj;
  return JSON.stringify(obj);
}
