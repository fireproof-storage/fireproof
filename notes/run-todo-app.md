# Fireproof Todo-App – Local Development Guide

> Branch: `jchris/run-todo-app`

This document walks a **new developer** from a fresh clone to a fully-running local stack (frontend, backend & Cloudflare worker) in under ten minutes.

---

## 1. Prerequisites

| Tool     | Version | Notes                                        |
| -------- | ------- | -------------------------------------------- |
| Node     | ≥ 22    | Install via Volta, nvm or Homebrew.          |
| pnpm     | ≥ 8     | `npm i -g pnpm`                              |
| Deno     | ≥ 1.43  | `brew install deno`                          |
| Wrangler | ≥ 4.19  | Cloudflare Workers CLI – `npm i -g wrangler` |
| SQLite3  | any     | Used by the local dashboard backend.         |
| Git      | ≥ 2.40  |                                              |

## 2. Clone and checkout

```bash
$ git clone https://github.com/fireproof-storage/fireproof.git
$ cd fireproof
$ git checkout jchris/run-todo-app
```

## 3. Install dependencies

```bash
# monorepo-wide deps (uses pnpm workspaces)
$ pnpm install
```

> Tip: the first install may take a while because of the large monorepo; subsequent installs are cached.

## 4. Configure environment variables

Create `dashboard/.env.local` with the following keys **on a single logical line each** (use `\n` for embedded line-feeds):

```dotenv
CLERK_PUB_JWT_KEY=-----BEGIN PUBLIC KEY-----\n…YOUR_CLERK_JWT_PEM…\n-----END PUBLIC KEY-----
CLOUD_SESSION_TOKEN_PUBLIC=YOUR_TEST_PUBLIC_KEY
CLOUD_SESSION_TOKEN_SECRET=YOUR_TEST_SECRET_KEY
VITE_CLERK_PUBLISHABLE_KEY=pk_test_XXXXXXXXXXXXXXXXXXXXXXXX
```

If you don’t have real Clerk keys yet you can sign up for a free Clerk account and create a test application; paste the **Publishable Key** and **Frontend API** values accordingly.

---

## 5. Prepare the local SQLite database

The dashboard backend uses Drizzle ORM. Generate the schema once:

```bash
$ cd dashboard
# generates ./dist/sqlite.db with all tables
$ pnpm db:push:sqlite
$ cd ..
```

You can inspect the DB at `dashboard/dist/sqlite.db` with any SQLite viewer.

---

## 6. Start the full stack

Run everything from the repository root:

```bash
$ pnpm dev
```

This launches **four** processes via the root `package.json` scripts:

| Service                | Port | Script                                      |
| ---------------------- | ---- | ------------------------------------------- |
| 3rd-party demo         | 3001 | `dev:3rd-party`                             |
| Todo-app frontend      | 3002 | `dev:todo-app`                              |
| Dashboard (React+Vite) | 3000 | `dev:dashboard` → proxies API calls to 7370 |
| Cloudflare D1 worker   | 8787 | `dev:cf-d1`                                 |

Backend API (Deno) listens on **7370** and is started by the dashboard script; logs are tailed to `dashboard/backend.log`.

Open:

- `http://localhost:3002` – Todo demo
- `http://localhost:3000` – Dashboard UI (auth required)

---

## 7. Common dev tasks

- **Format:** `pnpm format --write`
- **Lint:** `pnpm run lint`
- **Tests:** `pnpm run test`
- **Build:** `pnpm run build`

> Always run the checklist above before pushing (see project memory).

### Running only the dashboard stack

```bash
$ cd dashboard
$ pnpm dev           # runs Deno backend + Vite client together
```

### Regenerating the DB schema

```bash
$ cd dashboard
$ rm dist/sqlite.db            # optional clean slate
$ pnpm db:push:sqlite
```

---

## 8. Troubleshooting

| Symptom                        | Likely Cause                  | Fix                                                                                              |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `Invalid request` from backend | Auth keys missing / malformed | Verify `.env.local` keys – each must be ONE line with `\n` separators. Restart dashboard server. |
| Deno import errors             | Wrong path mapping            | `deno.jsonc` is already configured. Ensure you start Deno via the `backend:deno` script.         |
| DB query fails                 | Schema not migrated           | Run `pnpm db:push:sqlite` again or delete DB and rerun.                                          |
| Ports already in use           | Another dev server running    | Kill old `pnpm dev` or change ports in root `package.json`.                                      |

---

Happy hacking! 🎉
