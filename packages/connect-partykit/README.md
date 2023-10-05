# `@fireproof/partykit`

[Fireproof](https://use-fireproof.com) is an embedded JavaScript document database that runs in the browser (or anywhere with JavaScript) and **[connects to any cloud](https://www.npmjs.com/package/@fireproof/connect)**.

🎈 [PartyKit](https://www.partykit.io) is a realtime connection library that's the perfect complement to Fireproof's verifiable sync.

## Get started

We assume you already have an app that uses Fireproof in the browser, and you want to setup collaboration among multiple users via the cloud or peer-to-peer. To write your first Fireproof app, see the [Fireproof quickstart](https://use-fireproof.com/docs/react-tutorial), othwerwise read on. It's also easy to add Fireproof to PartyKit apps, check out this demo repo for [live magnetic poetry with database persistence.](https://github.com/fireproof-storage/sketch-magnetic-poetry)

PartyKit uses websockets and CloudFlare workers to manage a real-time group. Adding Fireproof requires one-line of config, and it syncs in its own party so you can use it with your existing [PartyKit](https://docs.partykit.io) apps without impacting existing code.

### 1. Install

In your existing Fireproof app install the connector:

```sh
npm install @fireproof/partykit
```

### 2. Configure

If you already have PartyKit configured in your project, all you need to do is add one line to the config defining a `fireproof` party.:

```js
{
  "name": "my-app-name",
  "main": "src/partykit/server.ts",
  "parties": {
    "fireproof": "node_modules/@fireproof/partykit/src/server.ts"
  }
}
```

If you haven't added PartyKit to your app, you want to run the PartyKit CLI to set up the basics:

```sh
npx partykit init
```

Refer to the [PartyKit docs](https://docs.partykit.io) for more info on configuring PartyKit.

### 3. Connect

You're all done on the server, and ready to develop locally and then deploy with no further changes. Now you just need to connect to the party in your client code:

```js
// you already have this in your app
import { useFireproof } from 'use-fireproof'
// add this line
import { connect } from '@fireproof/partykit'
```

Now later in your app connect to the party (be sure to do this a component that runs on every render, like your root component or layout):

```js
const { database } = useFireproof('my-app-database-name')
const connection = connect.partykit(database, process.env.NEXT_PUBLIC_PARTYKIT_HOST!)
```

The `connect.partykit` function is idempotent, and designed to be safe to call on every render. It takes two arguments, the current database, and the host of your PartyKit server. This will be the same host you are using in your app when calling `usePartySocket` and other PartyKit APIs, so once you have it set, you won't need to think about it again.

### 4. Collaborate

Now you can use Fireproof as you normally would, and it will sync in realtime with other users. Any existing apps you have that use the [live query](https://use-fireproof.com/docs/react-hooks/use-live-query) or [subscription](https://use-fireproof.com/docs/database-api/database#subscribe) APIs will automatically render multi-user updates.

