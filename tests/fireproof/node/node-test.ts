import { fireproof } from "../../../src/index.js"

async function main() {
    // console.log(fireproof);

    const db = fireproof("test-node");

    // const ok = 
    await db.put({ _id: "test", hello: "world" });

    // console.log(ok);

    // const doc = 
    await db.get("test");

    // console.log(doc);
}

main().catch(console.error);
