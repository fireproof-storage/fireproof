import React from "react";
import { redirect } from "react-router-dom";
import { fireproof } from "use-fireproof";
import { DEFAULT_ENDPOINT, SYNC_DB_NAME } from "../../helpers.ts";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const localName = url.searchParams.get("localName");
  if (!localName) {
    throw new Error("Local name is required");
  }

  const remoteName = url.searchParams.get("remoteName");
  const sanitizedRemoteName = remoteName?.replace(/^[^a-zA-Z0-9]+/g, "").replace(/[^a-zA-Z0-9]+/g, "_");

  const endpoint = url.searchParams.get("endpoint") || DEFAULT_ENDPOINT;

  const syncDb = fireproof(SYNC_DB_NAME);
  const result = await syncDb.query<
    string,
    {
      localName: string;
      remoteName: string;
    },
    [string, string]
  >((doc) => [doc.localName, doc.remoteName], {
    keys: [localName, remoteName],
    includeDocs: true,
  });
  if (result.rows.length === 0) {
    const ok = await syncDb.put({
      remoteName,
      sanitizedRemoteName,
      localName,
      endpoint,
      firstConnect: true,
    });
    console.log(ok);
  } else {
    const doc = result.rows[0].doc;
    console.log(doc);
    // TODO: Update the existing document if needed
    // await syncDb.put({ ...doc, endpoint, lastConnect: new Date() });
  }

  return redirect(`/fp/databases/${sanitizedRemoteName}`);
}

export default function DatabasesConnect() {
  return <></>;
}
