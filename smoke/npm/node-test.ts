/* eslint-disable no-console */
import { fireproof, PACKAGE_VERSION, rt } from "@fireproof/core/node";

async function main() {
  // console.log(fireproof);

  const db = fireproof("test-node");

  // const ok =
  await db.put({ _id: "test", hello: "world" });

  // console.log(ok);

  // const doc =
  await db.get("test");

  console.log(`${rt.runtimeFn().isDeno ? "DENO" : "NODE"} test working version:${PACKAGE_VERSION}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
