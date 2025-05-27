# Implementation Plan: Standardizing Query Return Values

## Issue Summary

- **Issue #802**: useLiveQuery and query return different structures
- **Problem**: Two inconsistencies exist:
  1. Database's `query` method returns only `rows` while React's `useLiveQuery` hook returns both `rows` and `docs`
  2. Type parameter order differs: `query<K, T, R>` vs `useLiveQuery<T, K, R>`
- **Impact**: These inconsistencies confuse AI models and cause runtime errors when code tries to access a non-existent property

## Implementation Plan: Option 1

Modify the Database `query` method to match `useLiveQuery` by:

1. Returning both `rows` and `docs` properties
2. Standardizing the type parameter order to match `useLiveQuery` (`<T, K, R>` instead of `<K, T, R>`)

## Steps

### 1. Update Type Definitions

#### File: `src/types.ts`

- Modify the `IndexRows` interface to include the `docs` property and standardize type parameter order:

```typescript
// Change from <K, T, R> to <T, K, R> to match useLiveQuery
export interface IndexRows<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T> {
  rows: IndexRow<K, T, R>[];
  docs: DocWithId<T>[]; // Add this line
}
```

- Note that we're also adding the default type parameter `K extends IndexKeyType = string` to match `useLiveQuery`

### 2. Modify the Query Implementation

#### File: `src/database.ts`

- Update the `query` method in `DatabaseImpl` class to add the `docs` property and reorder type parameters:

```typescript
// Change type parameter order from <K, T, R> to <T, K, R>
async query<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
  field: string | MapFn<T>,
  opts: QueryOpts<K> = {},
): Promise<IndexRows<T, K, R>> {  // Note the reordered type parameters here
  await this.ready();
  this.logger.Debug().Any("field", field).Any("opts", opts).Msg("query");
  const idx = typeof field === "string"
    ? index<T, K, R>(this, field)  // Reordered type parameters
    : index<T, K, R>(this, makeName(field.toString()), field);  // Reordered type parameters

  const result = await idx.query(opts);

  // Add docs property to match useLiveQuery behavior
  return {
    rows: result.rows,
    docs: result.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r)
  };
}
```

#### File: `src/indexer.ts`

- Update the `Index.query` method to return both `rows` and `docs` and adjust for reordered type parameters:

```typescript
// The Index class will need its type parameters reordered: <T, K, R> instead of <K, T, R>
async query(opts: QueryOpts<K> = {}): Promise<IndexRows<T, K, R>> { // Note reordered type params
  // Existing implementation...

  // When returning results, add the docs property
  const queryResult = await applyQuery<T, K, R>( // Reordered type parameters
    this.crdt,
    // ... existing logic for getting results
    opts
  );

  return {
    rows: queryResult.rows,
    docs: queryResult.rows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r)
  };
}
```

### 3. Simplify useLiveQuery Implementation

#### File: `src/react/use-live-query.ts`

- Simplify the hook now that the `query` method returns the expected structure with matching type parameter order:

```typescript
export function createUseLiveQuery(database: Database) {
  return function useLiveQuery<T extends DocTypes, K extends IndexKeyType = string, R extends DocFragment = T>(
    mapFn: MapFn<T> | string,
    query = {},
    initialRows: IndexRow<K, T, R>[] = [],
  ): LiveQueryResult<T, K, R> {
    const initialResult = {
      docs: initialRows.map((r) => r.doc).filter((r): r is DocWithId<T> => !!r),
      rows: initialRows,
    };

    const [result, setResult] = useState<LiveQueryResult<T, K, R>>(initialResult);

    const queryString = useMemo(() => JSON.stringify(query), [query]);
    const mapFnString = useMemo(() => mapFn.toString(), [mapFn]);

    const refreshRows = useCallback(async () => {
      // Now database.query returns both rows and docs directly with matching type order
      const res = await database.query<T, K, R>(mapFn, query); // Note: now using <T, K, R> to match type order
      setResult(res);
    }, [database, mapFnString, queryString]);

    useEffect(() => {
      refreshRows();
      const unsubscribe = database.subscribe(refreshRows);
      return () => {
        unsubscribe();
      };
    }, [database, refreshRows]);

    return result;
  };
}
```

### 4. Update Tests

#### Update existing tests to reflect the new return type:

- Modify test assertions to expect both `rows` and `docs` properties
- Add tests specifically for the `docs` property to ensure it contains the correct data

#### Example test:

```typescript
test("query returns both rows and docs", async () => {
  const db = await fireproof("test-db");
  await db.put({ _id: "doc1", type: "test", value: 123 });

  const result = await db.query("type");

  expect(result).toHaveProperty("rows");
  expect(result).toHaveProperty("docs");
  expect(result.docs[0]._id).toBe("doc1");
  expect(result.rows[0].doc._id).toBe("doc1");
});
```

### 5. Update Documentation

- Update API documentation to reflect the new return structure
- Add examples showing how to use both `rows` and `docs` properties
- Add a note in the changelog about this enhancement

## Compatibility Considerations

This change should not break existing code for several reasons:

1. **Return Values**:

   - Adding the `docs` property is additive and doesn't remove any existing functionality
   - Code that expects only `rows` will still work since that property remains unchanged

2. **Type Parameter Reordering**:

   - TypeScript's type inference will handle most cases automatically
   - Explicit type usage like `db.query<string, MyDocType>()` would need updates, but this is rare
   - We'll search the codebase for explicit type usages and update them

3. **Default Type Parameter**:
   - Adding `K extends IndexKeyType = string` provides better alignment with `useLiveQuery`
   - Makes it easier to use when the key type is string (most common case)

## Validation Plan

1. Run all existing tests to ensure backward compatibility
2. Add new tests for the `docs` property as described above
3. Test with actual applications that use the API to ensure no regressions

## Timeline

1. Code changes: 2-3 hours
   - Type definition updates: 30 minutes
   - Implementation changes: 1-1.5 hours
   - Finding and fixing explicit type parameter usages: 30-60 minutes
2. Testing: 1-2 hours
3. Documentation updates: 30 minutes
4. Code review and adjustments: 1 hour

Total estimated time: 4.5-6.5 hours
