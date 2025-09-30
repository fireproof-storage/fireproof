# useDocument Hook Guide

The `useDocument` hook is Fireproof's React hook for managing individual documents with automatic persistence, real-time updates, and form integration. It provides both object-style and tuple-style APIs for flexibility.

## Basic Usage

```typescript
import { useFireproof } from 'use-fireproof';

interface Todo {
  text: string;
  completed: boolean;
  date: number;
}

function TodoForm() {
  const { useDocument } = useFireproof('my-todos');
  const { doc, merge, save, submit } = useDocument<Todo>({
    text: '',
    completed: false,
    date: Date.now()
  });

  return (
    <form onSubmit={submit}>
      <input 
        value={doc.text} 
        onChange={(e) => merge({ text: e.target.value })} 
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Response Object Structure

The `useDocument` hook returns a hybrid object that supports both object destructuring and tuple destructuring:

### Object API (Recommended)

```typescript
const result = useDocument<T>(initialDoc);

// Modern object destructuring approach
const { doc, merge, replace, reset, refresh, save, remove, submit } = result;
```

**Properties:**

- **`doc`**: `DocWithId<T>` - The current document state
- **`merge`**: `(newDoc: Partial<T>) => void` - Merge partial updates
- **`replace`**: `(newDoc: T) => void` - Replace entire document
- **`reset`**: `() => void` - Reset to initial state
- **`refresh`**: `() => Promise<void>` - Reload from database
- **`save`**: `(existingDoc?: DocWithId<T>) => Promise<DocResponse>` - Save to database
- **`remove`**: `(existingDoc?: DocWithId<T>) => Promise<DocResponse>` - Delete document
- **`submit`**: `(e?: Event) => Promise<void>` - Save and reset (form handler)

### Tuple API (Legacy)

```typescript
// Legacy tuple destructuring (still supported)
const [doc, updateDoc, save, remove, reset, refresh] = useDocument<T>(initialDoc);
```

**Tuple Elements:**
1. `doc` - Current document
2. `updateDoc` - Legacy update function (see below)
3. `save` - Save function
4. `remove` - Remove function  
5. `reset` - Reset function
6. `refresh` - Refresh function

## Document State Management

### Initial Document

You can provide initial data in several ways:

```typescript
// Static initial document
const result = useDocument<Todo>({
  text: 'Default todo',
  completed: false
});

// Function-based initialization (called once)
const result = useDocument<Todo>(() => ({
  text: 'Generated todo',
  date: Date.now(),
  completed: false
}));

// Loading existing document by ID
const result = useDocument<Todo>({
  _id: 'existing-todo-id',
  text: 'fallback text'  // Used if document doesn't exist
});
```

### State Updates

#### `merge()` - Partial Updates (Recommended)

```typescript
const { doc, merge } = useDocument<Todo>({ text: '', completed: false });

// Update specific fields
merge({ text: 'New text' });  // Only updates text field
merge({ completed: true, date: Date.now() });  // Updates multiple fields
```

#### `replace()` - Full Document Replacement

```typescript
const { doc, replace } = useDocument<Todo>({ text: '', completed: false });

// Replace entire document (must provide all required fields)
replace({
  text: 'Complete new document',
  completed: true,
  date: Date.now()
});
```

#### `reset()` - Return to Initial State

```typescript
const { reset } = useDocument<Todo>({ text: 'Original', completed: false });

// Later...
reset(); // Returns doc to { text: 'Original', completed: false }
```

## Persistence Operations

### `save()` - Persist to Database

```typescript
const { doc, save, merge } = useDocument<Todo>({ text: '', completed: false });

// Make changes
merge({ text: 'My todo' });

// Save to database
const response = await save();
console.log('Saved with ID:', response.id);

// After save, doc._id will be populated
console.log('Document ID:', doc._id);
```

### `submit()` - Save and Reset (Form Integration)

```typescript
const { submit } = useDocument<Todo>({ text: '', completed: false });

// Perfect for form submission
const handleSubmit = async (e: FormEvent) => {
  await submit(e);  // Prevents default, saves, and resets
};

return (
  <form onSubmit={handleSubmit}>
    {/* form fields */}
    <button type="submit">Add Todo</button>
  </form>
);
```

### `remove()` - Delete Document

```typescript
const { doc, remove } = useDocument<Todo>({ _id: 'todo-1' });

// Delete document (requires _id)
await remove();
// Document is removed from database and state reset to initial
```

## Real-time Updates

The hook automatically subscribes to database changes:

```typescript
const { doc } = useDocument<Todo>({ _id: 'shared-todo' });

// If another client updates 'shared-todo', this component
// will automatically re-render with the new data
```

### Manual Refresh

```typescript
const { refresh } = useDocument<Todo>({ _id: 'todo-1' });

// Force reload from database
await refresh();
```

## Usage Patterns

### Form Integration

```typescript
function TodoForm() {
  const { doc, merge, submit } = useDocument<Todo>({
    text: '',
    completed: false,
    date: Date.now()
  });

  return (
    <form onSubmit={submit}>
      <input 
        value={doc.text}
        onChange={(e) => merge({ text: e.target.value })}
        placeholder="Enter todo"
      />
      <label>
        <input 
          type="checkbox"
          checked={doc.completed}
          onChange={(e) => merge({ completed: e.target.checked })}
        />
        Completed
      </label>
      <button type="submit">Add Todo</button>
    </form>
  );
}
```

### Document Editor

```typescript
function TodoEditor({ todoId }: { todoId: string }) {
  const { doc, merge, save } = useDocument<Todo>({
    _id: todoId,
    text: 'Loading...', // Fallback while loading
    completed: false
  });

  const handleSave = async () => {
    try {
      await save();
      console.log('Saved successfully');
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  return (
    <div>
      <input 
        value={doc.text}
        onChange={(e) => merge({ text: e.target.value })}
      />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

### Non-existent Document Handling

```typescript
// Document with ID that might not exist yet
const { doc, save } = useDocument<Todo>({
  _id: 'new-todo-123',
  text: 'Default text',
  completed: false
});

// doc.text will be 'Default text' until/unless document is found
// Calling save() will create the document if it doesn't exist
```

## Legacy API Support

### `updateDoc()` Function

The tuple API includes a legacy `updateDoc` function:

```typescript
const [doc, updateDoc] = useDocument<Todo>({ text: '', completed: false });

// Legacy update patterns
updateDoc({ text: 'New text' });           // Merge (default)
updateDoc({ text: 'New text' }, { replace: true });  // Replace
updateDoc(undefined, { reset: true });     // Reset
updateDoc();                               // Refresh
```

**Migration:** Use the object API methods instead:
- `updateDoc(data)` → `merge(data)`
- `updateDoc(data, { replace: true })` → `replace(data)`
- `updateDoc(undefined, { reset: true })` → `reset()`
- `updateDoc()` → `refresh()`

## Error Handling

```typescript
const { doc, save, remove } = useDocument<Todo>({ text: '' });

try {
  await save();
} catch (error) {
  console.error('Save failed:', error);
}

try {
  // remove() requires _id
  if (!doc._id) {
    throw new Error('Document must have _id to be removed');
  }
  await remove();
} catch (error) {
  console.error('Delete failed:', error);
}
```

## TypeScript Best Practices

### Define Clear Interfaces

```typescript
interface User {
  name: string;
  email: string;
  createdAt: string;
  settings?: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

const { doc, merge } = useDocument<User>({
  name: '',
  email: '',
  createdAt: new Date().toISOString()
});

// TypeScript ensures type safety
merge({ name: 'John' });  // ✅ Valid
merge({ invalidField: 'x' });  // ❌ TypeScript error
```

### Handle Optional Fields

```typescript
interface Todo {
  text: string;
  completed?: boolean;  // Optional field
  priority?: 'high' | 'medium' | 'low';
}

const { doc, merge } = useDocument<Todo>({
  text: '',
  // Optional fields can be omitted from initial state
});

// Safe access to optional fields
const isCompleted = doc.completed ?? false;
const priority = doc.priority ?? 'medium';
```

## Advanced Patterns

### Conditional Saving

```typescript
const { doc, save, merge } = useDocument<Todo>({ text: '', completed: false });

const handleSaveIfValid = async () => {
  if (doc.text.trim()) {
    await save();
  } else {
    console.log('Cannot save empty todo');
  }
};
```

### Debounced Auto-save

```typescript
import { useDeferredValue } from 'react';

function AutoSaveTodo() {
  const { doc, merge, save } = useDocument<Todo>({ text: '', completed: false });
  const deferredDoc = useDeferredValue(doc);

  useEffect(() => {
    if (deferredDoc._id && deferredDoc.text.trim()) {
      save(); // Auto-save after changes settle
    }
  }, [deferredDoc, save]);

  return (
    <input 
      value={doc.text}
      onChange={(e) => merge({ text: e.target.value })}
    />
  );
}
```

### Multiple Document Management

```typescript
function TodoWithSubtasks() {
  // Main todo document  
  const todo = useDocument<Todo>({ text: '', completed: false });
  
  // Subtask document
  const subtask = useDocument<Todo>({ text: '', completed: false });

  const handleSaveBoth = async () => {
    await Promise.all([
      todo.save(),
      subtask.save()
    ]);
  };

  return (
    <div>
      <input 
        placeholder="Main todo"
        value={todo.doc.text}
        onChange={(e) => todo.merge({ text: e.target.value })}
      />
      <input 
        placeholder="Subtask"
        value={subtask.doc.text}
        onChange={(e) => subtask.merge({ text: e.target.value })}
      />
      <button onClick={handleSaveBoth}>Save Both</button>
    </div>
  );
}
```

## Performance Considerations

1. **Initialization**: Use function-based initialization for expensive computations
2. **Updates**: Prefer `merge()` over `replace()` for better performance
3. **Subscriptions**: The hook automatically manages database subscriptions
4. **Memory**: Documents are automatically cleaned up when component unmounts

## Common Pitfalls

1. **Missing _id for operations**: `remove()` requires `doc._id` to be set
2. **State mutations**: Always use `merge()`, `replace()`, or `reset()` - never mutate `doc` directly
3. **Form integration**: Use `submit()` for forms rather than manual `save()` + `reset()`
4. **Type safety**: Define proper TypeScript interfaces for better development experience

## File Locations

- **Implementation**: `use-fireproof/react/use-document.ts`
- **Types**: `use-fireproof/react/types.ts` (lines 44-97)
- **Tests**: `use-fireproof/tests/use-document-with-nonexistent-id.test.tsx`
- **Examples**: `examples/react-router/src/pages/TodoEditor.tsx`