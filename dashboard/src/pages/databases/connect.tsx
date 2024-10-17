import React from "react";
import { redirect } from "react-router-dom";
import { fireproof } from "use-fireproof";

export async function loader({ request }) {
  const url = new URL(request.url);
  const localName = url.searchParams.get("localName");
  if (!localName) {
    throw new Error("Local name is required");
  }
  const remoteName = url.searchParams.get("remoteName");
  const endpoint = url.searchParams.get("endpoint");
  const petnames = fireproof("petname.mappings");
  const ok = await petnames.put({
    _id: "db:" + remoteName,
    localName,
    endpoint,
    firstConnect: false,
  });
  console.log(ok);
  return redirect(`/fp/databases/${localName}`);
}

export default function DatabasesConnect() {
  return <></>;
}
