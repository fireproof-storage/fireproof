# Metadata Propagation in Fireproof (mabels/dashboard-api Branch)

### Why This Document Exists

Fireproof's power comes from **keeping data portable** while still enforcing encryption, access control, and multi-device synchronization. All of those guarantees rely on _metadata_ travelling alongside the actual user data blocks.  
If you are new to the project, understanding _what_ metadata we keep and _where_ it flows is the fastest path to being productive: nearly every feature (queries, encryption, collaboration, replication) is implemented by _reading_ or _writing_ one of the metadata fields described below.

> **Take-away:** Whenever you touch a Fireproof component, ask yourself _"Which piece of metadata is this code responsible for?"_

### Reading the Codebase – Style Primer

Fireproof is written in modern **TypeScript** with a functional flavour:

* **Result / Option monads** (`Result.Ok`, `Result.Err`, etc.) are preferred over throwing exceptions.  
  Always check `.isErr()` rather than relying on `try/catch`.
* **Async/await everywhere.** You will rarely find raw Promises being chained – keep stack traces clean by awaiting.
* **Immutability first.** Functions avoid mutating arguments; instead they return new objects or update class-private state.
* **Small building blocks.** Large flows (like loading a CAR file) are composed from many tiny helpers – lean on your editor's *go-to-definition*.
* **Structured logging** via `logger.Info().Any({ key: value }).Msg("message")`.  
  Add context objects generously; logs are rendered in Loki/Grafana.

_Code layout conventions_

* Type definitions live next to implementation files (e.g. `blockstore/types.ts`).
* **Feature directories** (e.g. `protocols/cloud`) own everything from transport to codec – no giant `utils/` grab-bags.
* Tests mirror the `src/` tree one-for-one in `tests/`.

> **Tip for IDEs:** enable _TypeScript "strict"_ flags; the codebase compiles with no implicit `any`.

---
