# `@fireproof/aws`

[Fireproof](https://use-fireproof.com) is an embedded JavaScript document database that runs in the browser (or anywhere with JavaScript) and **[connects to any cloud](https://www.npmjs.com/package/@fireproof/connect)**.

This module, `@fireproof/aws`, allows you to connect your Fireproof database to AWS S3 and DynamoDB via pre defined Lambda functions, enabling you to sync your data across multiple users in real-time.

## Get started

We assume you already have an app that uses Fireproof in the browser, and you want to setup collaboration among multiple users via the cloud. To write your first Fireproof app, see the [Fireproof quickstart](https://use-fireproof.com/docs/react-tutorial), otherwise read on.

### 1. Install

In your existing Fireproof app install the connector:

```sh
npm install @fireproof/aws
```

### 2. Connect

You're all done on the server, and ready to develop locally and then deploy with no further changes. Now you just need to connect to the AWS in your client code. Fireproof has an already deployed SAM template and to use the provisioned resources without the websocket based live syncing (backwards compatibility with older fireproof versions) as well as with websocket connections you can simply use the s3Free and awsFree functions respectively. However, if one wants to deploy their own resources they can do so by deploying our sam template and adding the neccassary urls to connect's aws function:

```js
// you already have this in your app
import { useFireproof } from "use-fireproof";
// add this line
import { connect } from "@fireproof/aws";
```

Now later in your app connect to the party (be sure to do this a component that runs on every render, like your root component or layout):

```js
const { database } = useFireproof("my-app-database-name");
const connection = connect.awsFree(database);
```

OR

```js
const { database } = useFireproof("my-app-database-name");
const connection = connect.s3Free(database);
```

OR

```js
const { database } = useFireproof("my-app-database-name");
const connection = connect.aws(database, {
  uploadUrl,
  downloadUrl,
  websocketUrl,
});
```

All the functions are idempotent and designed to be safe to call on every render.

### 3. Collaborate

Now you can use Fireproof as you normally would, and it will sync in realtime with other users. Any existing apps you have that use the [live query](https://use-fireproof.com/docs/react-hooks/use-live-query) or [subscription](https://use-fireproof.com/docs/database-api/database#subscribe) APIs will automatically render multi-user updates.
