# TypeScript Document Typing with File Attachments in Fireproof

Great question! You're dealing with one of the more complex aspects of Fireproof's TypeScript integration. Here's the idiomatic approach based on the current codebase patterns:

## 1. Recommended Document Interface Pattern

**Extend Fireproof's base types properly:**

```typescript
import type { DocWithId, DocFileMeta } from "@fireproof/core-types-base";

// Base document interface extending DocTypes
interface CatalogDocument {
  vibeId: string;
  title: string;
  created: number;
  userId: string;
  type: "catalog"; // Discriminator for better type safety
}

// Complete typed document with Fireproof's built-in file support
interface CatalogDocWithFiles extends CatalogDocument {
  _files?: {
    screenshot?: DocFileMeta;
    source?: DocFileMeta;
  };
  // For direct access (if you still need it)
  screenshot?: {
    data: Uint8Array;
    size: number;
    type: string;
  };
}

// This gives you the full typed document
type CatalogDoc = DocWithId<CatalogDocWithFiles>;
```

## 2. Proper Query Result Typing

**Use generic parameters consistently:**

```typescript
// ✅ Correct: Specify your document type
const result = await sessionDb.query<CatalogDocWithFiles>("type", {
  key: "catalog",
  includeDocs: true,
});

// Now result.rows[0].doc is properly typed as DocWithId<CatalogDocWithFiles>
const catalogDoc = result.rows[0].doc; // No 'as any' needed!

// ✅ Correct: useAllDocs with typing
const { docs } = useAllDocs<CatalogDocWithFiles>({
  include_docs: true,
});
```

## 3. File Retrieval Pattern with Proper Typing

**Use type guards and proper async handling:**

```typescript
// Helper function for type-safe file access
async function getDocumentFile(
  doc: DocWithId<CatalogDocWithFiles>,
  fileName: keyof NonNullable<CatalogDocWithFiles["_files"]>,
): Promise<File | null> {
  const fileMeta = doc._files?.[fileName];
  if (!fileMeta || typeof fileMeta.file !== "function") {
    return null;
  }

  try {
    return await fileMeta.file();
  } catch (error) {
    console.error(`Failed to load file ${fileName}:`, error);
    return null;
  }
}

// Usage:
const screenshotFile = await getDocumentFile(catalogDoc, "screenshot");
if (screenshotFile) {
  // screenshotFile is properly typed as File
  console.log(`Screenshot: ${screenshotFile.name}, ${screenshotFile.size} bytes`);
}
```

## 4. Better Document Structure Approach

**Consider avoiding dual storage:**

```typescript
// Instead of storing files in both _files and as Uint8Array...
interface StreamlinedCatalogDoc {
  vibeId: string;
  title: string;
  created: number;
  userId: string;
  type: "catalog";
  _files?: {
    screenshot?: DocFileMeta;
    source?: DocFileMeta;
  };
  // Store metadata separately, not the binary data
  screenshotInfo?: {
    dimensions: { width: number; height: number };
    format: string;
    thumbnailGenerated: boolean;
  };
}
```

## 5. React Hook Integration

**Type-safe useDocument and useLiveQuery:**

```typescript
function CatalogEditor() {
  // ✅ Properly typed useDocument
  const { doc, merge, save } = useDocument<CatalogDocWithFiles>({
    vibeId: '',
    title: '',
    created: Date.now(),
    userId: 'current-user',
    type: 'catalog'
  });

  // ✅ Properly typed query results
  const catalogs = useLiveQuery<CatalogDocWithFiles>(
    'type',
    { key: 'catalog' }
  );

  return (
    <div>
      <input
        value={doc.title}
        onChange={(e) => merge({ title: e.target.value })}
      />
      {/* Type-safe file handling */}
      {doc._files?.screenshot && (
        <ImgFile file={doc._files.screenshot} alt="Screenshot" />
      )}
    </div>
  );
}
```

## 6. Advanced Pattern: Discriminated Unions

**For multiple document types in one database:**

```typescript
// Base types
interface BaseDoc {
  type: string;
  created: number;
  userId: string;
}

interface CatalogDoc extends BaseDoc {
  type: "catalog";
  vibeId: string;
  title: string;
  _files?: {
    screenshot?: DocFileMeta;
    source?: DocFileMeta;
  };
}

interface UserDoc extends BaseDoc {
  type: "user";
  name: string;
  email: string;
  _files?: {
    avatar?: DocFileMeta;
  };
}

// Union type for all possible documents
type AppDocument = CatalogDoc | UserDoc;

// Type-safe query with discrimination
const docs = await db.query<AppDocument>("type", { key: "catalog" });
const catalogDocs = docs.rows
  .map((row) => {
    const doc = row.doc;
    if (doc.type === "catalog") {
      // TypeScript knows this is CatalogDoc
      return doc; // doc.vibeId is available
    }
    return null;
  })
  .filter(Boolean);
```

## 7. File Upload Helper

**Type-safe file attachment:**

```typescript
async function attachFile<T extends { _files?: DocFiles }>(doc: DocWithId<T>, fileName: string, file: File): Promise<DocWithId<T>> {
  // Note: You'll need to implement the actual file storage logic
  // This is a conceptual example
  return {
    ...doc,
    _files: {
      ...doc._files,
      [fileName]: {
        type: file.type,
        size: file.size,
        cid: await uploadFile(file), // Your upload implementation
        file: () => Promise.resolve(file),
      },
    },
  };
}
```

## Understanding Fireproof's File System

### DocFileMeta Interface

```typescript
// From core/types/base/types.ts
export interface DocFileMeta {
  readonly type: string;
  readonly size: number;
  readonly cid: AnyLink;
  readonly car?: AnyLink;
  readonly lastModified?: number;
  url?: string;
  file?: () => Promise<File>;
}
```

### DocFiles Type

```typescript
// From core/types/base/types.ts
export type DocFiles = Record<string, DocFileMeta | File>;

export interface DocBase {
  readonly _id: string;
  readonly _files?: DocFiles;
  readonly _publicFiles?: DocFiles;
  readonly _deleted?: boolean;
}
```

## Common Patterns and Solutions

### Problem: Query Results Typed as `any`

**❌ Avoid:**

```typescript
const result = await sessionDb.query("type", { key: "screenshot", includeDocs: true });
const screenshot = result.rows[0].doc as any; // Don't do this!
```

**✅ Solution:**

```typescript
const result = await sessionDb.query<CatalogDocWithFiles>("type", {
  key: "catalog",
  includeDocs: true,
});
const catalogDoc = result.rows[0].doc; // Properly typed!
```

### Problem: File Access Requires Casting

**❌ Avoid:**

```typescript
const fileData = await (screenshot._files.screenshot as any).file();
```

**✅ Solution:**

```typescript
async function safeGetFile(fileMeta: DocFileMeta | undefined): Promise<File | null> {
  if (!fileMeta?.file) return null;
  try {
    return await fileMeta.file();
  } catch (error) {
    console.error("File access failed:", error);
    return null;
  }
}

const fileData = await safeGetFile(catalogDoc._files?.screenshot);
```

### Problem: Document Updates Require Casting

**❌ Avoid:**

```typescript
const updatedFiles: any = { ...existingDoc._files };
```

**✅ Solution:**

```typescript
const updatedDoc: DocWithId<CatalogDocWithFiles> = {
  ...existingDoc,
  _files: {
    ...existingDoc._files,
    newFile: newFileMeta,
  },
};
```

## React Components with Typed Documents

### Complete Example

```typescript
import React from 'react';
import { useFireproof, ImgFile } from 'use-fireproof';
import type { DocWithId, DocFileMeta } from '@fireproof/core-types-base';

interface ProjectDoc {
  title: string;
  description: string;
  type: 'project';
  created: number;
  _files?: {
    thumbnail?: DocFileMeta;
    assets?: DocFileMeta;
  };
}

function ProjectEditor({ projectId }: { projectId: string }) {
  const { useDocument, useLiveQuery } = useFireproof('projects');

  // Type-safe document editing
  const { doc, merge, save } = useDocument<ProjectDoc>({
    _id: projectId,
    title: '',
    description: '',
    type: 'project',
    created: Date.now()
  });

  // Type-safe file handling
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create DocFileMeta (implementation depends on your file upload strategy)
    const fileMeta: DocFileMeta = {
      type: file.type,
      size: file.size,
      cid: await uploadToFireproof(file), // Your upload logic
      file: () => Promise.resolve(file)
    };

    merge({
      _files: {
        ...doc._files,
        thumbnail: fileMeta
      }
    });

    await save();
  };

  return (
    <div>
      <input
        value={doc.title}
        onChange={(e) => merge({ title: e.target.value })}
        placeholder="Project title"
      />

      <textarea
        value={doc.description}
        onChange={(e) => merge({ description: e.target.value })}
        placeholder="Description"
      />

      <input
        type="file"
        onChange={handleFileUpload}
        accept="image/*"
      />

      {doc._files?.thumbnail && (
        <ImgFile file={doc._files.thumbnail} alt="Project thumbnail" />
      )}
    </div>
  );
}

function ProjectList() {
  // Type-safe querying
  const projects = useLiveQuery<ProjectDoc>('type', { key: 'project' });

  return (
    <div>
      {projects.rows.map(row => (
        <div key={row.id}>
          <h3>{row.doc.title}</h3>
          <p>{row.doc.description}</p>
          {row.doc._files?.thumbnail && (
            <ImgFile file={row.doc._files.thumbnail} alt="Thumbnail" />
          )}
        </div>
      ))}
    </div>
  );
}
```

## Best Practices Summary

### ✅ Do:

1. **Always use generics** with `DocWithId<T>`, `useDocument<T>`, `query<T>`, etc.
2. **Extend base interfaces** rather than creating from scratch
3. **Use `DocFileMeta`** for file metadata typing
4. **Create type-safe helper functions** for common operations
5. **Use discriminated unions** for multi-document-type databases
6. **Handle file access errors gracefully** with proper error checking

### ❌ Don't:

1. **Cast to `any`** - use proper generic typing instead
2. **Store files in both `_files` and as raw data** unless necessary
3. **Ignore TypeScript errors** - they usually indicate real type safety issues
4. **Create document interfaces from scratch** - extend Fireproof's base types
5. **Access `file()` without error handling** - it's an async operation that can fail

## Key Type Imports

```typescript
// Essential imports for typed Fireproof documents
import type { DocWithId, DocFileMeta, DocTypes, DocFiles, AllDocsResponse, QueryResult } from "@fireproof/core-types-base";
```

## File Locations Reference

- **Core Types**: `core/types/base/types.ts` (lines 223-250)
- **React Types**: `use-fireproof/react/types.ts`
- **ImgFile Component**: `use-fireproof/react/img-file.ts`
- **File Type Guards**: `use-fireproof/react/img-file.ts` (lines 24-31)

Following these patterns will give you full type safety with Fireproof documents and file attachments, eliminating the need for `any` casting and providing excellent developer experience with IntelliSense and compile-time error checking.
