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
              className="w-full py-2 px-3 bg-[#e6d7bf] border border-blue-400 rounded text-base font-medium text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-transparent transition duration-200 ease-in-out"
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
