## Metadata Flow Map: From UI to Storage

Fireproof's architecture flows from UI components down to persistent storage, with metadata guiding the journey:

```
┌───────────────┐     Authentication & Identity     ┌──────────────┐
│  React Hooks  │─────┐ (JWT, tenant, ledger) ┌─────│ Dashboard API │
└───────────────┘     │                       │     └──────────────┘
        │             ▼                       ▼             
        │      ┌─────────────┐        ┌─────────────┐      
        └─────▶│  WebSocket  │◀───────│    Msger    │      
               └─────────────┘        └─────────────┘      
                      │                     ▲               
                      │   ┌────────────┐   │               
                      └──▶│   Loader   │───┘               
                          └────────────┘                    
                           │         ▲                      
             ┌─────────────┘         │                      
             ▼                       │                      
      ┌────────────┐          ┌────────────┐               
      │ Blockstore │◀─────────│   KeyBag   │               
      └────────────┘          └────────────┘               
```

### Key Components and Their Responsibilities

Fireproof's metadata flow includes these essential components:

- **KeyBag**: Cryptographic key management, resolution, and persistence
- **Blockstore**: Data blocks and metadata storage with encryption support
- **Loader**: Orchestrates data loading, commits, and multi-store coordination
- **WebSocket Protocol**: Cloud communication, authentication, and session handling
- **Dashboard API**: Authentication and account management services
- **React Hooks**: UI integration for cloud attachment and token management

---
