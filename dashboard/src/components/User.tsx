import { Clerk } from "@clerk/clerk-js";
import { SignedIn, SignedOut, SignIn, SignInButton, UserButton, useSession } from "@clerk/clerk-react";
import { useEffect } from "react";

// let user;

// export const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
// await clerk.load({
//   signInUrl: "/login",
//   appearance: {
//     elements: {
//       footerAction: { display: "none" },
//     },
//   },
// });

// user = clerk.user;

// export const authResult = { user };

export function User() {
  const { isLoaded, session, isSignedIn } = useSession();
  /*
    if (!authResult.user) {
        return redirect(`/login?next_url=${encodeURIComponent(window.location.href)}`);
      }
    */

  useEffect(() => {
    if (isSignedIn && isLoaded) {
      session
        .getToken({
          template: "with-email",
          // leewayInSeconds: 60
        })
        .then((token) => {
          console.log(token);
          // setToken(token!)
          fetch('http://localhost:7370/', {
            method: 'POST',
            body: JSON.stringify({
                type: "tbd",
                auth: {
                    type: "clerk",
                    token: token
                }
            }),
          }).catch(console.error).then(console.log)
        });
    }
  }, [session, isLoaded, isSignedIn]);

  //   console.log("User", isLoaded, isSignedIn, session);
  //   if (isLoaded && !isSignedIn) {
  return (
    <>
      <SignedIn>
        {/* Login */}
        <UserButton />
      </SignedIn>
      <SignedOut>
        {/* LoggedIn */}
        <SignInButton>
          <img
            src={"https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp"}
            alt={"User profile"}
            className="w-8 h-8 rounded-full"
          />
        </SignInButton>
      </SignedOut>
    </>
  );
}
