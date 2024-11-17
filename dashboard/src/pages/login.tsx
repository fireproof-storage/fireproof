import React from "react";
import { redirect } from "react-router-dom";
import { clerk } from "../auth";

export async function loader({ request }) {
  const url = new URL(request.url);
  return redirect(
    clerk.buildSignInUrl({ redirectUrl: url.searchParams.get("next_url") })
  );
}

export default function Login() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-lg">Logging you in...</div>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[--foreground]"></div>
      </div>
    </div>
  );
}
