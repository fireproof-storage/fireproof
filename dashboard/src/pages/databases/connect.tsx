import React from "react";
import { redirect } from "react-router-dom";
import { fireproof } from "@fireproof/core-base";
import { DEFAULT_ENDPOINT, SYNC_DB_NAME } from "../../helpers.js";
import { URI } from "@adviser/cement";

export async function connectDatabasesLoader({ request }: { request: Request }) {
  const url = URI.from(request.url);
  const localName = url.getParam("localName");
  if (!localName) {
    throw new Error("Local name is required");
  }

  const remoteName = url.getParam("remoteName");
  const sanitizedRemoteName = remoteName?.replace(/^[^a-zA-Z0-9]+/g, "").replace(/[^a-zA-Z0-9]+/g, "_");

  const endpoint = url.getParam("endpoint") || DEFAULT_ENDPOINT;

  const syncDb = fireproof(SYNC_DB_NAME);
  const keys = [localName];
  if (remoteName) {
    keys.push(remoteName);
  }
  const result = await syncDb.query<
    {
      localName: string;
      remoteName: string;
    },
    [string, string]
  >((doc) => [doc.localName, doc.remoteName], {
    keys,
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

export function DatabasesConnect() {
  return <></>;
}
