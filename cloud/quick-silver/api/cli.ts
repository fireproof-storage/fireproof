/* eslint-disable no-console */
import { command, option, multioption, string, run, subcommands } from "cmd-ts";
import { QSApi } from "./qs-api.js";
import type { QSGet, QSPut } from "@fireproof/cloud-quick-silver-types";
import { ensureSuperThis } from "@fireproof/core-runtime";

const sthis = ensureSuperThis();

// ── shared connection options ─────────────────────────────────────────────────

function connectionOpts() {
  return {
    url: option({
      long: "url",
      short: "u",
      description: "WebSocket URL of the quick-silver worker",
      type: string,
    }),
    db: option({
      long: "db",
      short: "d",
      description: "Database name",
      type: string,
    }),
    authType: option({
      long: "auth-type",
      description: "Auth type",
      type: string,
      defaultValue: () => "anon",
    }),
    authToken: option({
      long: "auth-token",
      short: "t",
      description: "Auth token",
      type: string,
      defaultValue: () => "",
    }),
  };
}

function makeApi(args: { url: string; db: string; authType: string; authToken: string }): ReturnType<typeof QSApi> {
  return QSApi({
    url: args.url,
    db: args.db,
    auth: () => ({ type: args.authType, token: args.authToken }),
  });
}

// ── get ───────────────────────────────────────────────────────────────────────

const getCmd = command({
  name: "get",
  description: "Fetch one or more docs by key (comma-separated)",
  args: {
    ...connectionOpts(),
    keys: multioption({
      long: "keys",
      short: "k",
      description: "Key to fetch (repeatable)",
      type: string,
    }),
  },
  handler: async (args) => {
    const api = await makeApi(args);
    const ops: QSGet[] = args.keys.map((key) => ({ key }));
    for await (const r of api.get(ops)) {
      console.log(JSON.stringify(r));
    }
    await api.close();
  },
});

// ── put ───────────────────────────────────────────────────────────────────────

const putCmd = command({
  name: "put",
  description: "Write docs by key (repeatable: --pkg key,{json})",
  args: {
    ...connectionOpts(),
    pkg: multioption({
      long: "pkg",
      short: "p",
      description: "key,{json} pair to store (repeatable)",
      type: string,
    }),
  },
  handler: async (args) => {
    const ops: QSPut[] = args.pkg.map((pair) => {
      const comma = pair.indexOf(",");
      if (comma === -1) throw new Error(`invalid --pkg "${pair}": expected key,{json}`);
      const key = pair.slice(0, comma);
      const data = sthis.ende.cbor.encodeToUint8(JSON.parse(pair.slice(comma + 1)));
      return { key, data };
    });
    const api = await makeApi(args);
    for await (const r of api.put(ops)) {
      console.log(JSON.stringify(r));
    }
    await api.close();
  },
});

// ── all ───────────────────────────────────────────────────────────────────────

const queryCmd = command({
  name: "query",
  description: "Stream all docs in the database",
  args: {
    ...connectionOpts(),
  },
  handler: async (args) => {
    const api = await makeApi(args);
    for await (const r of api.query()) {
      console.log(JSON.stringify(r));
    }
    await api.close();
  },
});

// ── subscribe ─────────────────────────────────────────────────────────────────

const subscribeCmd = command({
  name: "subscribe",
  description: "Subscribe to events for a subscribeId (streams until Ctrl+C)",
  args: {
    ...connectionOpts(),
  },
  handler: async (args) => {
    const api = await makeApi(args);
    const handle = api.subscribe();

    const cleanup = () => {
      handle.close();
      api.close().then(() => process.exit(0)).catch(() => process.exit(1));
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    for await (const r of handle.events) {
      console.log(JSON.stringify(r));
    }
    await api.close();
  },
});

// ── entry point ───────────────────────────────────────────────────────────────

const cmd = subcommands({
  name: "qs",
  description: "quick-silver CLI",
  version: "0.0.0",
  cmds: { get: getCmd, put: putCmd, query: queryCmd, subscribe: subscribeCmd },
});

run(cmd, process.argv.slice(2)).then(() => process.exit(0)).catch(console.error);
