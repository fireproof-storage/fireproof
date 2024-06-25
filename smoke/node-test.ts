import { fireproof } from "@fireproof/core";

async function main() {
  // console.log(fireproof);

  const db = fireproof("test-node");

  // const ok =
  await db.put({ _id: "test", hello: "world" });

  // console.log(ok);

  // const doc =
  await db.get("test");

  console.log("test working");
}

main().catch(console.error);
