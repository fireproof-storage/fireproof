# External Indexers

Fireproof is designed to make indexing in external indexers efficient and seamless. Each database tracks it's change history and provides a feed of changes since any clock. If you don't provide a clock, you'll get all changes. Each change includes it's clock, so if you keep track of a high water mark, you can safely restart your indexing process and know you aren't missing any updates.

For single-user workloads it can often be enough to index the local dataset on page load, and use your index in memory. For larger data use-cases you probably want to use an indexer than remember everything it has added, and incrementally add new items as changes occur. For an example of that sort of index, check out [`fireproof/test/fulltext.test.js`]() for an example.

