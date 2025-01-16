import { useForm } from "react-hook-form";
import { Form, redirect, SubmitTarget, useSubmit } from "react-router-dom";
import { fireproof } from "use-fireproof";

export async function Action({ request }: { request: Request }) {
  const dbName = (await request.json()).dbName;
  const database = fireproof(dbName);
  await database.blockstore.loader?.ready();
  return redirect(`/fp/databases/${dbName}`);
}

export default function New() {
  const submit = useSubmit();
  const { register, handleSubmit } = useForm();

  function onSubmit(data: SubmitTarget) {
    submit(data, {
      method: "post",
      action: ".",
      encType: "application/json",
    });
  }

  return (
    <div className="bg-[--muted] shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold leading-6 text-[--foreground]">New Database Name:</h3>

        <Form onSubmit={handleSubmit(onSubmit)} className="mt-5 sm:flex sm:items-center">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="dbName" className="sr-only">
              Database Name
            </label>
            <input
              id="dbName"
              {...register("dbName", { required: true })}
              type="text"
              placeholder="New database name"
              autoFocus
              className="w-full py-2 px-3 bg-[--background] border border-[--border] rounded text-sm font-medium text-[--foreground] placeholder-[--muted-foreground] focus:outline-none focus:ring-1 focus:ring-[--ring] focus:border-transparent transition duration-200 ease-in-out"
            />
          </div>
          <button
            type="submit"
            className="mt-3 inline-flex w-full items-center justify-center rounded bg-[--accent] px-3 py-2 text-sm font-semibold text-accent-foreground shadow-sm hover:bg-[--accent]/80 transition-colors sm:ml-3 sm:mt-0 sm:w-auto"
          >
            Create
          </button>
        </Form>
      </div>
    </div>
  );
}
