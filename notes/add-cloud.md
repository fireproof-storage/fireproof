# PR #653: Add Cloud Gateway Support

## Summary of Changes

This PR adds a cloud gateway to Fireproof, enabling remote synchronization capabilities. It introduces a substantial amount of new code with minimal changes to existing code.

### Stats Overview
- 48 files changed
- 6,613 insertions (+)
- 15 deletions (-)

### Key Components Added

#### Cloud Backend
- A complete backend system for cloud connectivity
- Components for handling WebSocket and HTTP connections
- Meta-merger subsystem for handling metadata operations
- Server implementations using Hono
- Connection testing framework

#### Protocol Implementation
- New cloud protocol in `src/protocols/cloud/`
- Message type definitions and data structures
- Connection handlers for both HTTP and WebSocket
- Core messaging system

#### Runtime Extensions
- Cloud gateway implementation in `src/runtime/gateways/cloud/`
- STS service for secure token management
- Meta-key handling system

### Package Changes
- Updated dependencies in package.json and package-fireproof-core.json
- Added new test configurations for cloud functionality

### Testing
- Comprehensive test coverage for new cloud functionality
- Test helpers and utilities

## Impact
This PR represents a significant expansion of Fireproof's capabilities, adding a complete cloud synchronization layer while maintaining the existing local database functionality. 