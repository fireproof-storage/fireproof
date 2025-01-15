import { SignedOut, SignIn, SignInButton, useSession } from "@clerk/clerk-react";
import { is } from "drizzle-orm";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router-dom";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const nextUrl = url.searchParams.get("next_url") || "/";
  return nextUrl;
}

export default function Login() {
  const nextUrl = useLoaderData() as string;
  // const navigate = useNavigate();

  const { isLoaded, session, isSignedIn } = useSession()

  // const [token, setToken] = useState('');

  useEffect(() => {
    if (isSignedIn && isLoaded) {
      session.getToken({
        template: "with-email",
        // leewayInSeconds: 60
      }).then((token) => {
        // setToken(token!)
        console.log(token)
        // fetch('http://localhost:3000/api/verify', {
        //   method: 'POST',
        //   body: JSON.stringify(token),
        // }).catch(console.error).then(console.log)
      })
    }
  }, [session, isLoaded, isSignedIn])

  console.log("token", isSignedIn, isLoaded, session)

  return (

      <div className="h-screen w-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <SignedOut>
            <SignInButton />
          </SignedOut>
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
  );
}
