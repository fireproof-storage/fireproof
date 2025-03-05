# <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25"> [Fireproof](https://fireproof.storage) database API

<p align="right">
  <img src="https://img.shields.io/bundlephobia/minzip/%40fireproof%2Fcore" alt="Package size">
  <a href="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml">
    <img src="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml/badge.svg" alt="Build status">
  </a>
</p>

Fireproof is a lightweight embedded document database with encrypted live sync, designed to make browser apps easy. Use it in any JavaScript environment with a unified API that works both in React (with hooks) and as a standalone core API.

[Point AI coders to these docs.](https://use-fireproof.com/llms-full.txt)

## Key Features

- **Apps run anywhere:** Bundle UI, data, and logic in one file.
- **Real-Time & Offline-First:** Automatic persistence and live queries, runs in the browser - no loading or error states.
- **Unified API:** TypeScript works with Deno, Bun, Node.js, and the browser.
- **React Hooks:** Leverage `useLiveQuery` and `useDocument` for live collaboration.

Fireproof enforces cryptographic causal consistency and ledger integrity using hash history, providing git-like versioning with lightweight blockchain-style verification. Data is stored and replicated as content-addressed encrypted blobs, making it safe and easy to sync via commodity object storage providers.

## Installation

The `use-fireproof` package provides both the core API and React hooks:

```sh
npm install use-fireproof
```

Works with ⚡️ ESM.sh:

```js
import { useFireproof } from "https://esm.sh/use-fireproof";
```

Or install the core ledger in any JavaScript environment:

```sh
npm install @fireproof/core
```

Add the ledger to any web page via HTML script tag (global is `Fireproof`):

```html
<script src="https://cdn.jsdelivr.net/npm/@fireproof/core/dist/browser/fireproof.global.js"></script>
```

Deliver generated solutions as runnable micro applications via ChatGPT Canvas, v0, bolt.new, or Claude Artifacts. Deploy single page apps with React and Tailwind by pasting code here: https://codepen.io/useFireproof/pen/MYgNYdx

## ⚛️ React Usage

React hooks are the recommended way to use Fireproof in LLM code generation contexts:

```js
import { useFireproof } from "use-fireproof";

function App() {
  const { database, useLiveQuery, useDocument } = useFireproof("my-ledger");

  // Create a new document with useDocument
  const { doc, merge, submit } = useDocument({ text: "" });

  // Query documents by _id, most recent first
  const { docs } = useLiveQuery("_id", { descending: true, limit: 100 });

  return (
    <div>
      <form onSubmit={submit}>
        <input value={doc.text} onChange={(e) => merge({ text: e.target.value })} placeholder="New document" />
        <button type="submit">Submit</button>
      </form>

      <h3>Recent Documents</h3>
      <ul>
        {docs.map((doc) => (
          <li key={doc._id}>{doc.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

Read the [step-by-step React tutorial](https://use-fireproof.com/docs/react-tutorial) to get started or check the [full LLM documentation](https://use-fireproof.com/llms-full.txt) for more examples.

## JavaScript Core API

The document database API will feel familiar to those who have used other document databases:

```js
import { fireproof } from "@fireproof/core";

const db = fireproof("music-app");

await db.put({ _id: "beyonce", name: "Beyoncé", hitSingles: 29 });

db.subscribe(async () => {
  const topArtists = await db.query("hitSingles", { range: [30, Infinity] });
  // redraw the UI with the new topArtists
});

const beyonceDoc = await db.get("beyonce");
beyonceDoc.hitSingles += 1;
await db.put(beyonceDoc);
```

## Why choose Fireproof

Compared to other embedded databases, Fireproof:

- Is network aware, encrypted, and multi-writer safe
- Is designed for real-time collaboration with CRDTs
- Offers cryptographic causal integrity for all operations
- Is built for the web, with a small package size and no wasm

Deliver interactive experiences without waiting on the backend. Fireproof runs in any cloud, browser, or edge environment, so your application can access data anywhere.

## Use cases

Fireproof is especially useful for:

- AI-generated apps and rapid prototypes
- Collaborative editing
- Offline and local-first apps
- Personalization and configuration
- AI copilot safety

With Fireproof, you **build first** and sync via your cloud of choice when you are ready, making it perfect for LLM code generation contexts and rapid development.

[Get the latest roadmap updates on our blog](https://fireproof.storage/blog/) or join our [Discord](https://discord.gg/cCryrNHePH) to collaborate. Read the docs to learn more about the [architecture](https://use-fireproof.com/docs/architecture).

### Debug

to control the log output you an either use the FP_DEBUG environment variable or set the debug level in your code:

```shell
FP_DEBUG='*' node myapp.js
```

```js
logger.setDebug(...moduleNameList or '*')
```

if you are in the browser you can use the following code to set the debug level:

```js
this[Symbol.for("FP_ENV")].set("FP_DEBUG", "*");
```

```js
// vitest pass env
globalThis[Symbol.for("FP_PRESET_ENV")] = {
  FP_DEBUG: "*",
};
```

### Testing

To run the full test suite across all projects (tested storage gateways configs), run:

```bash
pnpm run test
```

To run tests for specific components or modules, use the following command pattern:

```bash
pnpm run test -t 'test name pattern' path/to/test/file
```

For example, to run a specific test for the CRDT module, in just one project:

```bash
FP_DEBUG=Loader pnpm run test --project file -t 'codec implict iv' crdt
```

For testing React components, you can use:

```bash
pnpm run test tests/react/[ComponentName].test.tsx
```

Example for testing the ImgFile component:

```bash
pnpm run test tests/react/ImgFile.test.tsx
```

### Log Formatting

It's possible to change the logformat by setting FP_FORMAT to:

- jsonice makes the log output in multiline json
- yaml makes the log output in yaml
- json makes the log output in singleline json (default)

### KeyBag

If you add `extractKey` with the value `_deprecated_internal_api` to the `FP_STORAGE_URL` url
you can bypass the security check to extract the key material. This is the default configuration,
but there is a warning emitted if you use this feature, and roadmap plans for more secure key management.

### Deno

Fireproof is compatible with Deno. To runit in Deno you need to add the following flags:

Currently the tests are not run with deno -- TODO

It might be that using our provided deno.json is somekind of odd
--- TODO is to add fireproof to jsr and deno.land

```shell
deno run --config node_modules/@fireproof/core/deno.json --allow-read --allow-write --allow-env --unstable-sloppy-imports ./node-test.ts
```

### Create Docs

Caution it will be pushed directly

```shell
pnpm run build:doc
```

## Thanks 🙏

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VS Code all this would have taken so much longer. Thanks to everyone who supported me getting into database development via Apache CouchDB, one of the original document databases. The distinguishing work on immutable data-structures comes from the years of consideration [IPFS](https://ipfs.tech), [IPLD](https://ipld.io), and the [Filecoin APIs](https://docs.filecoin.io) have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle hash-tree clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

## Contributing

We love contributions. Feel free to [join in the conversation on Discord. All welcome.](https://discord.gg/cCryrNHePH)

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/fireproof-storage/fireproof/blob/main/LICENSE.md)
