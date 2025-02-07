import { useContext, useState } from "react";
import { AppContext } from "../app-context.tsx";

export async function betterLoader({ request }: { request: Request }) {
  // const url = new URL(request.url);
  // const nextUrl = url.searchParams.get("next_url") || "/";
  // return nextUrl;
}

export function Better() {
  // const nextUrl = useLoaderData() as string;
  // const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState<File | null>(null);

  const ctx = useContext(AppContext);

  const authClient = ctx.cloud.betterAuthClient;
  const session = ctx.cloud.betterAuthClient.useSession();
  console.log("session", session);

  async function signUp() {
    const { data, error } = await authClient.signUp.email(
      {
        email,
        password,
        name,
        // image: image ? convertImageToBase64(image) : undefined,
      },
      {
        onRequest: (ctx) => {
          //show loading
        },
        onSuccess: (ctx) => {
          //redirect to the dashboard
        },
        onError: (ctx) => {
          alert(ctx.error.message);
        },
      },
    );
  }

  async function signIn() {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });
    const token = await authClient.$fetch("/token");
    //  }, {
    //     onRequest: (ctx) => {
    //      //show loading
    //     },
    //     onSuccess: (ctx) => {
    //         console.log("login", ctx)
    //       //redirect to the dashboard
    //     },
    //     onError: (ctx) => {
    //       alert(ctx.error.message);
    //     },
    //   });
    console.log("SignIn", token);
  }

  async function signOut() {
    const { data, error } = await authClient.signOut();
    console.log("SignOut", data, error);
  }

  return (
    <div>
      <label htmlFor="name">Name</label>
      <input type="name" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="email">Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {/* <input type="file" onChange={(e) => setImage(e.target.files?.[0])} /> */}
      <button type="button" onClick={signUp}>Sign Up</button>

      <button type="button" onClick={signIn}>Sign In</button>

      {session.data && <button type="button" onClick={signOut}>Sign Out</button>}
    </div>
  );
}
