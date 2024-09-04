import { redirect } from "react-router-dom";

export async function clientLoader() {
  return redirect(`/fp/databases`);
}

export default function Index() {}
