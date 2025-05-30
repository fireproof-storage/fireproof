# Fireproof Cloud Integration in React

This guide walks React developers through integrating **Fireproof**—a local-first database with optional cloud sync—into their applications.  
You will learn how to:

1. Install the `use-fireproof` package.
2. Configure cloud attachment with `toCloud`.
3. Use the `useFireproof` hook for data access and sync state.
4. Handle authentication tokens and error states in the UI.
5. Perform basic CRUD operations with the Fireproof database.

> **Target audience**: JavaScript/TypeScript React developers familiar with hooks and modern build tooling (Vite, Next.js, etc.).

---

## 1. Installation

```bash
# we prefer pnpm in the Fireproof project
pnpm add use-fireproof
```

If you plan to build and host your own Fireproof Cloud dashboard/API you will also need the cloud packages. For this guide we assume you are using the hosted development endpoint shown in the examples.

---

## 2. Quick-start Example

Below is a trimmed & annotated version of [`cloud/3rd-party/src/App.tsx`](../cloud/3rd-party/src/App.tsx). It demonstrates **everything you need** to get a Fireproof-backed UI running:

```tsx
import { useFireproof, toCloud } from 'use-fireproof';

export function App() {
  // 1️⃣ Create (or open) the database and attach it to the cloud
  const { database, useLiveQuery, useDocument, attach } = useFireproof('fireproof-cloud-demo', {
    attach: toCloud({
      dashboardURI: 'http://localhost:3000/fp/cloud/api/token',
      tokenApiURI: 'https://dev.connect.fireproof.direct/api',
      urls: { base: 'fpcloud://fireproof-v2-cloud-dev.jchris.workers.dev' },
    }),
  });

  // 2️⃣ Use the document hook for creating new items
  const { doc, merge, submit } = useDocument({
    text: '',
    type: 'note',
    createdAt: Date.now(),
  });

  // 3️⃣ Live query for all 'note' type documents, sorted by creation date
  const { docs: recentNotes } = useLiveQuery('type', {
    key: 'note',
    descending: true,
    limit: 10,
  });

  // 4️⃣ Additional specialized queries
  // Query notes created today
  const today = new Date();
  const todayQuery = useLiveQuery(
    (doc) => [doc.type, doc.createdAt && new Date(doc.createdAt).toDateString()],
    { prefix: ['note', today.toDateString()] }
  );

  // 5️⃣ Render UI & provide interactions
  return (
    <>
      <h1>Fireproof Cloud Demo</h1>
      <p>
        {/* attach.state can be 'initial' | 'attaching' | 'attached' | 'error' */}
        Status: <code>{attach.state}</code>
        {attach.state === 'attached' && (
          <> – token: {attach.ctx.tokenAndClaims.tokenAndClaims.token}</>
        )}
        {attach.state === 'error' && <span>{attach.error.message}</span>}
      </p>

      {/* Add a new document using useDocument hook */}
      <form onSubmit={submit}>
        <input 
          value={doc.text} 
          onChange={(e) => merge({ text: e.target.value })}
          placeholder="New note"
        />
        <button type="submit">Add Note</button>
      </form>

      {/* Reset token if required for troubleshooting */}
      {attach.ctx.tokenAndClaims.state === 'ready' && (
        <button onClick={() => attach.ctx.tokenAndClaims.reset()}>Reset Token</button>
      )}

      {/* Display all recent notes */}
      <h2>Recent Notes ({recentNotes.length})</h2>
      <ul>
        {recentNotes.map((note) => (
          <li key={note._id}>
            <div>{note.text}</div>
            <small>{new Date(note.createdAt).toLocaleString()}</small>
            <button onClick={() => database.del(note._id)}>Delete</button>
          </li>
        ))}
      </ul>

      {/* Display today's notes */}
      <h2>Today's Notes ({todayQuery.docs.length})</h2>
      <ul>
        {todayQuery.docs.map((note) => (
          <li key={note._id}>{note.text}</li>
        ))}
      </ul>
    </>
  );
}
```

### What just happened?

1. **Local-first**: `useFireproof('fireproof-cloud-demo')` opens/creates a local database. Reads and writes are instant.
2. **Sync**: `toCloud()` provides the instructions needed for secure, end-to-end-encrypted replication.
3. **React Hooks**: Fireproof provides React-specific hooks:
   - `useDocument`: For creating and updating individual documents with form binding.
   - `useLiveQuery`: For real-time data subscriptions that update when data changes.
4. **Live Queries**: Two query patterns demonstrated:
   - Simple key-based query: `useLiveQuery('type', { key: 'note' })` 
   - Custom mapping function: `useLiveQuery((doc) => [doc.type, new Date(doc.createdAt).toDateString()])`
5. **Token & Attach State**: The cloud attachment process is fully observable through the `attach.state` property.

---

## 3. Deep-dive: `useFireproof` & Cloud Attachment

| API | Purpose |
| --- | --- |
| `useFireproof(name, options?)` | Opens a local database and returns `{ database, attach, useLiveQuery, useDocument }`. |
| `toCloud(config)` | Returns an **attacher** that instructs the hook how to replicate to the cloud. |
| `attach.state` | `initial` \| `attaching` \| `attached` \| `error` – great for UI hints. |
| `attach.error` | Error object available when `state === 'error'`. |
| `attach.ctx` | Low-level context (token store, underlying replication objects). |
| `useLiveQuery(key, options?)` | Subscribe to live-updating query results. Results update when data changes. |
| `useDocument(initialDoc)` | Create or update documents with form integration via `{ doc, merge, submit }`. |

Configuration fields used in `toCloud`:

- **dashboardURI** – where end-users fetch their JWT (e.g. internal dashboard).
- **tokenApiURI** – your public token endpoint (e.g. Cloudflare Worker).
- **urls.base** – the base "fpcloud://" URL of your Fireproof Cloud instance.
- *(Optional)* `tenant`, `ledger` – pre-select multi-tenant IDs if your backend enforces them.

For more on the hook internals see [`notes/attach/06-react-hook-ui-attachment.md`](attach/06-react-hook-ui-attachment.md).

---

## 4. Handling Edge Cases

### Refreshing an expired token
Use `attach.ctx.tokenAndClaims.reset()` which sets the token state back to `initial`. The hook will then request a new token via `dashboardURI`.

### Offline usage
Fireproof works offline out of the box. Any writes performed while offline are stored locally and will replicate when connectivity is restored.

### Conflict resolution
Fireproof uses **CRDTs** internally so last-writer-wins merges are automatic. You rarely need manual conflict handling, but you can always fetch historical versions if required.

---

## 5. CRUD & Query Cheatsheet

```ts
// Create / Update via core API
database.put({ _id: 'note:42', title: 'Hello' });

// Create / Update via hooks (preferred in React)
const { doc, merge, submit } = useDocument({ title: '' });
merge({ title: 'New Title' });
submit(); // Save the document

// Read one
database.get('note:42');

// Read many with live queries
const { docs } = useLiveQuery('_id', { descending: true, limit: 100 }); // Most recent docs
const { docs } = useLiveQuery('type', { key: 'note' }); // All notes
const { docs } = useLiveQuery('rating', { range: [3, 5] }); // Range query

// Custom query function with date filtering
const { docs } = useLiveQuery(
  (doc) => [doc.type, doc.created && new Date(doc.created).toDateString()],
  { prefix: ['note', new Date().toDateString()] } // Notes from today
);

// Delete
database.del('note:42');
```

> **Tip**: Live queries automatically update your UI when data changes. For advanced indexing options, see `notes/attach-meta.md`.

---

## 6. Testing Your Components

Use React Testing Library or Vitest with the in-memory backend:

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

it('adds a row', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
  expect(await screen.findByText('item-0')).toBeVisible();
});
```

No special environment variables are required—the local Fireproof database lives entirely in JS memory during tests.

---

## 7. Next Steps

1. Deploy your own Fireproof Cloud worker or Kubernetes service.
2. Secure the token API with your auth provider (Auth0, Clerk, etc.).
3. Explore composite indexes for advanced queries.
4. Join the community: <https://discord.gg/fireproof>

---

### Appendix: Glossary

- **Database Name** – A unique string for your app/tenant (e.g. `my-todo-db`).
- **Tenant & Ledger** – Multi-tenant identifiers used by Fireproof Cloud to separate data.
- **Token** – JWT proving the client can read/write a given ledger.
- **Attach** – The act of connecting a local DB to its cloud peer.

*Happy hacking!* ✨
