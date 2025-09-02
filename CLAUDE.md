# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fireproof is a lightweight embedded document database with encrypted live sync for JavaScript environments. It's designed to work in browsers, Node.js, Deno, and other JavaScript runtimes with a unified API. The repository is structured as a monorepo with multiple packages and includes React hooks integration.

## Common Development Commands

- `pnpm run check` - Run format, lint, test, and build in sequence

### Building and Development

- `pnpm run build` - Build all packages (runs prebuild, build scripts, and pub scripts)
- `pnpm run build:tsc` - Build using TypeScript compiler
- `pnpm run build:tsup` - Build using tsup bundler
- `pnpm run dev` - Start development servers for cloud components
- `pnpm run dev:dashboard` - Start dashboard development server on port 3002
- `pnpm run dev:3rd-party` - Start 3rd-party development server on port 3001

### Testing

- `pnpm run test` - Run all tests using vitest
- `pnpm run test:file` - Run file-based tests
- `pnpm run test:indexeddb` - Run IndexedDB-specific tests
- `pnpm run test:deno` - Run tests in Deno environment
- `pnpm run test -t 'test name pattern' path/to/test/file` - Run specific tests
- `FP_DEBUG=Loader pnpm run test --project file -t 'codec implicit iv' crdt` - Run specific test with debugging

### Code Quality

- `pnpm run lint` - Run ESLint
- `pnpm run format` - Run Prettier formatting

### Docker Management

- `pnpm run docker:down` - Stop Docker containers
- `pnpm run docker:up` - Start Docker containers
- `pnpm run docker:restart` - Restart Docker containers
- `pnpm run docker:logs` - View Docker container logs
- `pnpm run docker:health` - Check Docker container and MinIO health

### Publishing and Distribution

- `pnpm run smoke` - Run smoke tests against built packages
- `pnpm run fppublish` - Publish packages to npm
- `pnpm run presmoke` - Build and publish to local registry for smoke testing

## Architecture Overview

### Core Components

**Database Layer (`src/database.ts`, `src/ledger.ts`)**

- `DatabaseImpl` - Main database implementation with CRUD operations
- `Ledger` - Lower-level data storage and versioning layer
- CRDT (Conflict-free Replicated Data Types) implementation for distributed consistency

**Blockstore (`src/blockstore/`)**

- Content-addressed storage system using IPLD blocks
- Multiple gateway implementations (file, IndexedDB, memory, cloud)
- Encryption and serialization handling
- Transaction management and commit queues

**Runtime (`src/runtime/`)**

- Platform-specific implementations (Node.js, Deno, browser)
- File system abstractions
- Key management and cryptography
- Storage gateway factory patterns

**React Integration (`src/react/`)**

- `useFireproof` - Main hook for database access
- `useLiveQuery` - Real-time query results
- `useDocument` - Document-level operations
- `useAllDocs` - Bulk document operations
- `ImgFile` component for file attachments

**Protocols (`src/protocols/`)**

- Cloud synchronization protocols
- Dashboard API protocols
- Message passing and connection management

### Storage Gateways

The system supports multiple storage backends:

- **File** - Local file system storage (Node.js/Deno)
- **IndexedDB** - Browser-based storage
- **Memory** - In-memory storage for testing
- **Cloud** - Remote storage with sync capabilities

### Testing Infrastructure

Uses Vitest with multiple configurations:

- `vitest.workspace.ts` - Main workspace configuration
- Separate configs for file, memory, IndexedDB, and cloud testing
- Screenshot testing for React components
- Multiple test environments (file, memory, indexeddb, cloud variants)

## Key File Locations

- `src/index.ts` - Main entry point
- `src/database.ts` - Database implementation
- `src/ledger.ts` - Core ledger functionality
- `src/crdt.ts` - CRDT implementation
- `src/blockstore/` - Storage layer
- `src/runtime/` - Platform-specific code
- `src/react/` - React hooks and components
- `tests/` - Test suites organized by component

## Development Notes

- Uses pnpm for package management
- TypeScript with strict configuration
- ESM modules throughout
- Supports Node.js >=20.18.1
- Uses Vitest for testing with multiple environments
- Includes comprehensive smoke testing pipeline
- Debug logging available via `FP_DEBUG` environment variable
- Uses content-addressed storage with cryptographic integrity
- Implements causal consistency for distributed operations

## React Development

When working with React components:

- Use `useFireproof` hook to access database functionality
- `useLiveQuery` provides real-time query results that update automatically
- `useDocument` handles individual document operations with optimistic updates
- File attachments are handled through the `_files` property and `ImgFile` component
- Test React components using the testing utilities in `tests/react/`

## Cloud and Sync

- Cloud functionality is in the `cloud/` directory
- Supports multiple cloud backends (CloudFlare D1, LibSQL, etc.)
- WebSocket and HTTP-based synchronization
- Encrypted data transmission and storage
- Multi-tenant architecture support
