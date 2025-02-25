//BETTER-OFFimport { useContext, useState } from "react";
//BETTER-OFFimport { AppContext } from "../app-context.tsx";
//BETTER-OFFimport { Button } from "../components/Button.tsx";
//BETTER-OFF
//BETTER-OFFexport async function betterLoader({ request }: { request: Request }) {
//BETTER-OFF  // const url = new URL(request.url);
//BETTER-OFF  // const nextUrl = url.searchParams.get("next_url") || "/";
//BETTER-OFF  // return nextUrl;
//BETTER-OFF}
//BETTER-OFF
//BETTER-OFFexport function Better() {
//BETTER-OFF  // const nextUrl = useLoaderData() as string;
//BETTER-OFF  // const navigate = useNavigate();
//BETTER-OFF
//BETTER-OFF  const [email, setEmail] = useState("");
//BETTER-OFF  const [password, setPassword] = useState("");
//BETTER-OFF  const [name, setName] = useState("");
//BETTER-OFF  const [image, setImage] = useState<File | null>(null);
//BETTER-OFF
//BETTER-OFF  const ctx = useContext(AppContext);
//BETTER-OFF
//BETTER-OFF  const authClient = ctx.cloud.betterAuthClient;
//BETTER-OFF  const session = ctx.cloud.betterAuthClient.useSession();
//BETTER-OFF  console.log("session", session);
//BETTER-OFF
//BETTER-OFF  async function signUp() {
//BETTER-OFF    const { data, error } = await authClient.signUp.email(
//BETTER-OFF      {
//BETTER-OFF        email,
//BETTER-OFF        password,
//BETTER-OFF        name,
//BETTER-OFF        // image: image ? convertImageToBase64(image) : undefined,
//BETTER-OFF      },
//BETTER-OFF      {
//BETTER-OFF        onRequest: (ctx) => {
//BETTER-OFF          //show loading
//BETTER-OFF        },
//BETTER-OFF        onSuccess: (ctx) => {
//BETTER-OFF          //redirect to the dashboard
//BETTER-OFF        },
//BETTER-OFF        onError: (ctx) => {
//BETTER-OFF          alert(ctx.error.message);
//BETTER-OFF        },
//BETTER-OFF      },
//BETTER-OFF    );
//BETTER-OFF  }
//BETTER-OFF
//BETTER-OFF  async function signIn() {
//BETTER-OFF    const { data, error } = await authClient.signIn.email({
//BETTER-OFF      email,
//BETTER-OFF      password,
//BETTER-OFF    });
//BETTER-OFF    const token = await authClient.$fetch("/token");
//BETTER-OFF    //  }, {
//BETTER-OFF    //     onRequest: (ctx) => {
//BETTER-OFF    //      //show loading
//BETTER-OFF    //     },
//BETTER-OFF    //     onSuccess: (ctx) => {
//BETTER-OFF    //         console.log("login", ctx)
//BETTER-OFF    //       //redirect to the dashboard
//BETTER-OFF    //     },
//BETTER-OFF    //     onError: (ctx) => {
//BETTER-OFF    //       alert(ctx.error.message);
//BETTER-OFF    //     },
//BETTER-OFF    //   });
//BETTER-OFF    console.log("SignIn", token);
//BETTER-OFF  }
//BETTER-OFF
//BETTER-OFF  async function signOut() {
//BETTER-OFF    const { data, error } = await authClient.signOut();
//BETTER-OFF    console.log("SignOut", data, error);
//BETTER-OFF  }
//BETTER-OFF
//BETTER-OFF  return (
//BETTER-OFF    <div>
//BETTER-OFF      <label htmlFor="name">Name</label>
//BETTER-OFF      <input type="name" value={name} onChange={(e) => setName(e.target.value)} />
//BETTER-OFF      <label htmlFor="password">Password</label>
//BETTER-OFF      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
//BETTER-OFF      <label htmlFor="email">Email</label>
//BETTER-OFF      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
//BETTER-OFF      {/* <input type="file" onChange={(e) => setImage(e.target.files?.[0])} /> */}
//BETTER-OFF      <Button variation="primary" onClick={signUp}>
//BETTER-OFF        Sign Up
//BETTER-OFF      </Button>
//BETTER-OFF
//BETTER-OFF      <Button variation="secondary" onClick={signIn}>
//BETTER-OFF        Sign In
//BETTER-OFF      </Button>
//BETTER-OFF
//BETTER-OFF      {session.data && (
//BETTER-OFF        <Button variation="destructive" onClick={signOut}>
//BETTER-OFF          Sign Out
//BETTER-OFF        </Button>
//BETTER-OFF      )}
//BETTER-OFF    </div>
//BETTER-OFF  );
//BETTER-OFF}
