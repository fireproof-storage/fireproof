import { ClerkProvider, SignIn } from "@clerk/clerk-react";
import React from "react";
import { useLoaderData, useNavigate } from "react-router-dom";

export async function loader({ request }) {
  const url = new URL(request.url);
  const nextUrl = url.searchParams.get("next_url") || "/";
  return nextUrl;
}

export default function Login() {
  const nextUrl = useLoaderData() as string;
  const navigate = useNavigate();

  return (
    <ClerkProvider
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      signInFallbackRedirectUrl={nextUrl}
    >
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <SignIn
            appearance={{
              elements: {
                headerSubtitle: { display: "none" },
                footer: { display: "none" },
              },
            }}
          />
        </div>
      </div>
    </ClerkProvider>
  );
}
