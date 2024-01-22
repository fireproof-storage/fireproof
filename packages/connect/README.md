# `@fireproof/connect`

The connectors work with Fireproof's [encrypted blockstore](https://www.npmjs.com/package/@fireproof/encrypted-blockstore) allowing you to select the best cloud provider for your app. The blockstore itself can be used with any CID-based workload, providing a pluggable alternative to [Helia](https://docs.ipfs.tech/reference/js/api/).

[Fireproof](https://use-fireproof.com) is an embedded JavaScript document database that runs in the browser (or anywhere with JavaScript) and **connects to any cloud**. Read on for pointers to connect to PartyKit, S3, IPFS, and more. [Learn about the connector architecture in the concept guide.](https://use-fireproof.com/docs/concept-guide/cloud-connectors)

This is the base module, so you likely won't install it directly, but rather one of the connectors below. They are split into separate modules to keep the bundle size down.

## Get started

We assume you already have an app that uses Fireproof in the browser, and you want to setup collaboration among multiple users via the cloud or peer-to-peer. To write your first Fireproof app, see the [Fireproof quickstart](https://use-fireproof.com/docs/react-tutorial), othwerwise read on.

## Connectors

- [🎈 PartyKit](https://www.npmjs.com/package/@fireproof/partykit) - **best for high-performance**, uses websockets and CloudFlare workers to manage a real-time group. Adding Fireproof requires one-line of config, and it syncs in it's own room so you can use it with your existing [PartyKit](https://docs.partykit.io) apps.
- [S3](https://github.com/fireproof-storage/valid-cid-s3-bucket/tree/cars) - to **self-host your data**, deploy this SAM template that provides validating signed S3 upload urls. Because Fireproof is immutable, content-addressed, and end-to-end encrypted, it's safe to run this bucket in public without worrying about unauthorized data corruption or leaks.
- [🪐 IPFS](https://www.npmjs.com/package/@fireproof/ipfs) - **free for app developers**, the IPFS connector uses [UCAN](https://ucan.xyz) to provide self-soveriegn user auth, and [web3.storage](https://web3.storage) to upload to [IPFS](https://ipfs.tech).
- [REST](https://github.com/fireproof-storage/fireproof/blob/main/packages/connect/scripts/rest-server.js) - **simple Node.js backend**, we'd love your contributions to the server in `scripts/rest-server.js`! Take a look at the client in `src/store-remote.ts` to see two endpoints you'll need to implement.
- **Filesystem & Browser** - mentioning for completeness, although these are part of the core package and don't require any additional installation aside from using the node bundle when appropriate.

## Contributing

To run the tests, run them from the `packages/fireproof` directory. See also `packages/fireproof/test/www` for plain HTML test examples. To build the project:

```sh
pnpm install
npm run build
```

See the root level README for instructions on how file bug reports, pull requests, etc.