// deno run --allow-read --allow-write --allow-env --allow-import deno-test.ts
/* eslint-disable no-console */

interface DenoIF {
  env: {
    get: (key: string) => string | undefined;
  };
  readFile(path: string): Promise<Uint8Array>;
  exit(code: number): void;
}

const Deno: DenoIF = (globalThis as unknown as { Deno: DenoIF }).Deno;

async function getVersion() {
  const fpVersion = await Deno.readFile(`${Deno.env.get("projectBase")}/dist/fp-version`).then((b) =>
    // eslint-disable-next-line no-restricted-globals
    new TextDecoder().decode(b).trim(),
  );
  let version = `refs/tags/v${fpVersion}`;
  const githubRef = Deno.env.get("GITHUB_REF");
  if (githubRef && githubRef.startsWith("refs/tags/v")) {
    version = githubRef;
  }
  return version.split("/").slice(-1)[0].replace(/^v/, "");
}

async function main() {
  const url = `http://localhost:4874/@fireproof/core@${await getVersion()}`;
  console.log("loading fireproof from ", url);
  const { fireproof, PACKAGE_VERSION, rt } = await import(url);

  const db = fireproof("test-node", { storageUrls: { base: "memory://xxx" } });

  // const ok =
  await db.put({ _id: "test", hello: "world" });

  // console.log(ok);

  // const doc =
  await db.get("test");

  console.log(`${rt.runtimeFn().isDeno ? "DENO" : "NODE"} test working version:${PACKAGE_VERSION}`);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
