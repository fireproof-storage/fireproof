# Version series 0.19 to series 0.20

Disclaimer: Version number are political and might be a topic of change.

The 0.19 series was our first release after a major refactor of the codebase. But the 0.19 series lacks some features that we wanted to implement and they will be incompatible on internal api's.
From 0.19 on we will ensure that our database format is stable and that we will not break backward compatibility with any upcoming release.
What are the breaking changes in the 0.20 series?

- To enable prevent multiple serialization and deserialization of the data
  which send or received by gateways. The Gateway interface will change
  from passing Uint8Arrays and Url to passing a runtime Object which
  discribes the data on a semantic level. This give the gateway the
  ability to serialize and deserialize the data and enhance if needed.
- We rename from Database to Ledger with no functional changes.
- a new memory implementation is replacing the memfs implementation.
  The prev use was to add to file:// the parameter fs=memfs now just use
  memory:// works for Ledger as KeyBags.
- The opts parameter of fireproof changed so that it's now possible
  to specify a every persitence like data/file/meta/wal or index-data/index-file/index-meta/index-wal a own URL. In the internals we also
  prevents the multiple instanciation of Gateways and Stores with results
  in better performance and less memory. This is a breaking change.
- The FragmentGateway is now gone it if the functionality is needed the
  gateway could use the FragmentGateway to implement the functionality.
- There is now a GatewayInterceptor which allows to intercept to push
  an custom interceptor between a Gateway and the core. This enables
  functionality like logging, encryption, compression, etc.
- RegisterStoreProtocol need now to implement a defaultURI method,
  which returns the default URI for the store. This function is also used
  to expose the version nr of the gateways implemetation. This is a breaking change.
- The async process of store like replication and CRDT sync are rebuild.
  To improve the performance and the stability.
- Deno is now native supported and tested without node compatibility.
