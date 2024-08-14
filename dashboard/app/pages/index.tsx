import { LoaderFunctionArgs, redirect } from "react-router-dom";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  return redirect(`/fp/databases`);
};
