import { Clerk } from "@clerk/clerk-js";
import { SignedIn, SignedOut, SignIn, SignInButton, UserButton, useSession } from "@clerk/clerk-react";
import { useEffect } from "react";
import { aw } from "vitest/dist/chunks/reporters.D7Jzd9GS.js";

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
  // db.connect(getFPCloud({
  //     ledgerId: "ledgerId",
  //     // clerkSession: session,
  //     // tokenFactory: async () => {
  //     // const token = await session.getToken({
  //     //     template: "with-email",
  //     // });
  //     // return token;
  //     // }
  // }))

  //   useEffect(() => {
  //     if (isSignedIn && isLoaded) {
  //       session
  //         .getToken({
  //           template: "with-email",
  //           // leewayInSeconds: 60
  //         })
  //         .then((token) => {
  //           console.log(token);
  //           // setToken(token!)
  //           fetch('http://localhost:7370/', {
  //             method: 'POST',
  //             body: JSON.stringify({
  //                 type: "tbd",
  //                 auth: {
  //                     type: "clerk",
  //                     token: token
  //                 }
  //             }),
  //           }).catch(console.error).then(async (res) => {
  //             if (res && res.ok) {
  //                 console.log(JSON.parse(await res.text()));
  //             }
  //           })
  //         });
  //     }
  //   }, [session, isLoaded, isSignedIn]);

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
