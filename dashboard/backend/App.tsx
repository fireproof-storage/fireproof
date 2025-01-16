import { useEffect, useState } from "react";
import "./App.css";

import { SignedIn, SignedOut, SignInButton, UserButton, useSession } from "@clerk/clerk-react";
import { API_URL } from "../src/helpers.ts";

export default function App() {
  const { isLoaded, session, isSignedIn } = useSession();

  const [token, setToken] = useState("");

  useEffect(() => {
    if (isSignedIn && isLoaded) {
      session
        .getToken({
          template: "with-email",
          // leewayInSeconds: 60
        })
        .then((token) => {
          setToken(token!);
          fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(token),
          })
            .catch(console.error)
            .then(console.log);
        });
    }
  }, [session, isLoaded, isSignedIn]);

  console.log(session);
  return (
    <header>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>

      {isLoaded && isSignedIn && (
        <div>
          <p>This session has been active since {session.lastActiveAt.toLocaleString()}</p>
          <pre>{token}</pre>
        </div>
      )}
    </header>
  );
}

// export default App
// "sess_2rZsyJs3UnOtupMe8xH9Df959iq"
