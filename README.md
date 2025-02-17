# <img src="https://fireproof.storage/static/img/flame.svg" alt="Fireproof logo" width="25"> [Fireproof](https://fireproof.storage) realtime ledger

<p align="right">
  <img src="https://img.shields.io/bundlephobia/minzip/%40fireproof%2Fcore" alt="Package size">
  <a href="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml">
    <img src="https://github.com/fireproof-storage/fireproof/actions/workflows/ci.yaml/badge.svg" alt="Build status">
  </a>
</p>

### Build first, sync later: perfect for AI-generated apps and rapid prototypes

Fireproof is an embedded document ledger that lets you build full-stack apps in a single file. This makes it ideal for AI code generation and rapid prototyping - just write your features and access your data anywhere. 

[Point AI coders to these docs.](https://use-fireproof.com/llms-full.txt)

### JavaScript quick start

The document ledger API will feel familiar. Queries use dynamic indexes, and the ledger can refresh your UI, as seen in the `db.subscribe` call below, as well as the React liveQuery hook.

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

Jump to the docs site [for JavaScript API basics.](https://use-fireproof.com/docs/ledger-api/basics)

### Live data hooks for React

Fireproof [React hooks for live data](https://use-fireproof.com/docs/category/react-hooks) avoid boilerplate and make building collaborative apps a breeze.

```js
import { useFireproof } from 'use-fireproof'

function App() {
  const { useLiveQuery, useDocument } = useFireproof("my-db-name")
  const completedTodos = useLiveQuery('completed', { limit: 10 })
  const { doc, merge, save } = useDocument(() => ({type: 'todo', text: '', completed: false, created: Date.now() }))
```

Read the [step-by-step React tutorial](https://use-fireproof.com/docs/react-tutorial) to get started.

## Why choose Fireproof

Compared to other embedded ledgers, Fireproof:

- is network aware, encrypted, and multi-writer safe
- is designed for real-time collaboration with CRDTs
- offers cryptographic causal integrity for all operations
- is built for the web, with a small package size and no wasm

Deliver interactive experiences without waiting on the backend. Fireproof runs in any cloud, browser, or edge environment, so your application can access data anywhere.

[Get the latest roadmap updates on our blog](https://fireproof.storage/blog/) or join our [Discord](https://discord.gg/cCryrNHePH) to collaborate. Read the docs to learn more about the ledger [architecture](https://use-fireproof.com/docs/architecture).

### Use cases

Fireproof allows web developers to build full-stack apps. It's especially useful for:

- Rapid prototyping
- AI copilot safety
- Collaborative editing
- Personalization and configuration
- Offline and local-first apps

With Fireproof, you **build first** and sync via your cloud of choice when you are ready, so it's as easy to add to existing apps as it is to build something new. Drop Fireproof in your page with a script tag and start sharing interactive data.

Fireproof is a great fit for code sandboxes and online IDEs, as you can get started without any configuration. This also makes it [easy for AI to write Fireproof apps](https://use-fireproof.com/docs/chatgpt-quick-start).

### Install

Get started with the React hooks:

```sh
npm install use-fireproof
```

or install the ledger in any JavaScript environment:

```sh
npm install @fireproof/core
```

The default build is optimized for browsers, to load the node build add `/node`:

```js
import { fireproof } from "@fireproof/core/node";
```

Add the ledger to any web page via HTML script tag (global is `Fireproof`):

```html
<script src="https://cdn.jsdelivr.net/npm/@fireproof/core/dist/browser/fireproof.global.js"></script>
```

Go ahead and write features, then [connect to any cloud backend](https://www.npmjs.com/package/@fireproof/connect) later.

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
pnpm run build:docs
```

## Thanks 🙏

Fireproof is a synthesis of work done by people in the web community over the years. I couldn't even begin to name all the folks who made pivotal contributions. Without npm, React, and VS Code all this would have taken so much longer. Thanks to everyone who supported me getting into ledger development via Apache CouchDB, one of the original document ledgers. The distinguishing work on immutable data-structures comes from the years of consideration [IPFS](https://ipfs.tech), [IPLD](https://ipld.io), and the [Filecoin APIs](https://docs.filecoin.io) have enjoyed.

Thanks to Alan Shaw and Mikeal Rogers without whom this project would have never got started. The core Merkle hash-tree clock is based on [Alan's Pail](https://github.com/alanshaw/pail), and you can see the repository history goes all the way back to work begun as a branch of that repo. Mikeal wrote [the prolly trees implementation](https://github.com/mikeal/prolly-trees).

## Contributing

We love contributions. Feel free to [join in the conversation on Discord. All welcome.](https://discord.gg/cCryrNHePH)

# License

Dual-licensed under [MIT or Apache 2.0](https://github.com/fireproof-storage/fireproof/blob/main/LICENSE.md)
