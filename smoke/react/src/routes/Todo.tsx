import { useState } from "react";
import { useFireproof } from "use-fireproof";

// Define default values for a new todo to avoid undefined
const DEFAULT_TODO = {
  text: "",
  date: Date.now(),
  completed: false,
};

// Create a non-partial interface for required fields
interface TodoData {
  text: string;
  date: number;
  completed: boolean;
  _id?: string;
}

// Use Partial type for components that might have incomplete data
type Todo = Partial<TodoData>;

// Ensure no undefined values are persisted to the database
function sanitizeTodo(todo: Partial<TodoData>): TodoData {
  return {
    text: todo.text || "",
    date: todo.date || Date.now(),
    completed: !!todo.completed,
    // Only include _id if it actually exists
    ...(todo._id ? { _id: todo._id } : {}),
  };
}

export default function TodoList() {
  const { useDocument, useLiveQuery } = useFireproof("TodoDB");
  const [selectedTodo, setSelectedTodo] = useState<string>("");
  const todos = useLiveQuery<Todo>("date", { limit: 1000, descending: true });
  const {
    doc: todo,
    merge,
    submit,
  } = useDocument<TodoData>({
    ...DEFAULT_TODO, // Use default values to avoid undefined
  });

  const handleAddTodo = async () => {
    try {
      // Make sure we never save undefined values
      await submit(sanitizeTodo(todo));
    } catch (e) {
      console.error("Add-Todo Error:", e);
    }
  };

  return (
    <>
      <div>
        <input
          type="text"
          value={todo.text || ""}
          placeholder="new todo here"
          onChange={(e) => {
            merge({ text: e.target.value.trim() });
          }}
        />
        <button onClick={handleAddTodo}>Add Todo</button>
      </div>
      {todos.docs.map((todo: Todo) => (
        <div key={todo._id}>
          <input
            type="radio"
            checked={selectedTodo === todo._id}
            onChange={() => {
              setSelectedTodo(todo._id || "");
            }}
          />
          <span
            data-testid={`todo-item-${todo._id}`}
            style={{
              textDecoration: todo.completed ? "line-through" : "none",
            }}
          >
            {todo.text || ""}
          </span>
        </div>
      ))}
      {selectedTodo && <TodoEditor key={selectedTodo} id={selectedTodo} onClose={() => setSelectedTodo("")} />}
    </>
  );
}

interface TodoEditorProps {
  readonly id: string;
  readonly onClose?: () => void;
}

function TodoEditor({ id, onClose }: TodoEditorProps) {
  const { useDocument } = useFireproof("TodoDB");
  // When loading an existing document, ensure default values for all fields
  const {
    doc: todo,
    merge,
    save,
    submit,
    reset,
    del,
  } = useDocument<TodoData>({
    _id: id,
    ...DEFAULT_TODO, // Use defaults for all fields to guarantee they are defined
  });

  const handleToggle = async () => {
    try {
      // Create a complete todo object with the toggled completed state
      const updatedTodo = {
        ...todo,
        completed: !todo.completed,
      };

      // Save the complete todo object rather than using merge+save
      const result = await save(sanitizeTodo(updatedTodo));

      if (result.ok) {
        // Force a clean update of the document state
        merge(updatedTodo);
      }
    } catch (e) {
      console.error("TodoEditor toggle error:", e);
    }
  };

  const handleSave = async () => {
    try {
      // Save a sanitized version of the todo
      await submit(sanitizeTodo(todo));
      if (onClose) onClose();
    } catch (e) {
      console.error("TodoEditor save error:", e);
    }
  };

  const handleDelete = async () => {
    try {
      await del();
      // Reset to a clean default state with no undefined values
      await reset(DEFAULT_TODO);
      if (onClose) onClose();
    } catch (e) {
      console.error("TodoEditor delete error:", e);
    }
  };

  return (
    <div id="todo-editor" data-testid="todo-editor">
      <input type="checkbox" checked={!!todo.completed} onChange={handleToggle} />
      <input
        type="text"
        value={todo.text || ""}
        placeholder="update todo here"
        onChange={(e) => {
          merge({ text: e.target.value.trim() });
        }}
      />
      <button onClick={handleSave}>Save Changes</button>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
}
