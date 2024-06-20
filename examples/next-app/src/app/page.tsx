"use client";
import { Database, fireproof } from "@fireproof/core";
import { connect } from "@fireproof/ucan";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import useLocalStorageState from "use-local-storage-state";

interface AuthFormValues {
  email: string;
}

export default function Home() {
  const [email, setEmail] = useLocalStorageState<string>("example-email");
  const [db] = useState<Database>(fireproof("example"));
  const [connection] = useState(connect.ucan(db, "example-sync"));
  const { register, handleSubmit } = useForm<AuthFormValues>();
  const { data: docs, mutate: mutateTestThings } = useSWR("test things", async () => db.query("test"), {
    refreshInterval: 1000,
  });
  async function addThing() {
    await db.put({ test: "foo", time: Date.now() });
    await mutateTestThings();
  }

  async function login(data: AuthFormValues) {
    // set email - the change will be detected and auth will happen below
    setEmail(data.email);
  }

  // this will run any time email changes
  useEffect(
    function () {
      if (email) {
        (async () => {
          console.debug(`authorizing as ${email}`);
          await connection.authorize(email as `${string}@${string}`);
          console.debug(`authorized as ${email}`);
        })();
      }
    },
    [email],
  );
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      {docs && docs.rows.map((r: any) => <pre key={r.id}>{JSON.stringify(r, null, 2)}</pre>)}
      <button onClick={addThing}>Add test thing</button>
      {email ? (
        <div>logged in as {email}</div>
      ) : (
        <form onSubmit={handleSubmit((data: AuthFormValues) => login(data))}>
          <input {...register("email")} placeholder="email" />
          <input type="submit" />
        </form>
      )}
    </main>
  );
}
