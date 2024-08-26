import { useForm } from "react-hook-form";
import { Form, redirect, useSubmit } from "react-router-dom";
import { fireproof } from "use-fireproof";

export async function clientAction({ request }) {
  const dbName = (await request.json()).dbName;
  const database = fireproof(dbName);
  await database.blockstore.loader?.ready();
  return redirect(`/fp/databases/${dbName}`);
}

export default function New() {
  const submit = useSubmit();
  const { register, handleSubmit } = useForm();

  const onSubmit = (data) => {
    submit(data, {
      method: "post",
      action: ".",
      encType: "application/json",
    });
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-base font-semibold leading-6 text-gray-900">
          New Database Name:
        </h3>

        <Form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-5 sm:flex sm:items-center"
        >
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
              className="flex h-10 border border-input ring-[--offset-background] focus-visible:ring-1 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[--muted-foreground] focus-visible:outline-none 
              disabled:cursor-not-allowed disabled:opacity-50 w-40 bg-[--muted] rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="mt-3 inline-flex w-full items-center justify-center rounded bg-[--primary] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:ml-3 sm:mt-0 sm:w-auto"
          >
            Create
          </button>
        </Form>
      </div>
    </div>
  );
}
