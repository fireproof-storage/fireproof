import { useState, useEffect } from "react";
import { useFireproof } from "use-fireproof";

// Define default values for a new todo to avoid undefined
const DEFAULT_TODO = {
  text: "",
  date: Date.now(),
  completed: false
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

export default function TodoList() {
  const { useDocument, useLiveQuery } = useFireproof("TodoDB");
  const [selectedTodo, setSelectedTodo] = useState<string>("");
  const todos = useLiveQuery<Todo>("date", { limit: 1000, descending: true });
  const { doc: todo, merge, submit } = useDocument<TodoData>({
    ...DEFAULT_TODO // Use default values to avoid undefined
  });
  // console.log("todos", todo, todos.docs.length) //todos.docs.map((t) => t.text));

  return (
    <>
      <div>
        <input
          type="text"
          value={todo.text || ""}
          placeholder="new todo here"
          onChange={(e) => {
            // Merge preserves other fields while setting text
            merge({ text: e.target.value.trim() });
          }}
        />
        <button
          onClick={() => {
            // console.log(`saving todo-0: ${todo.text}`);
            // console.log(`saving todo-1: ${todo.text}`);
            // console.log("saving todo", todo, save.toString());
            submit()
              .catch((e: Error) => console.error("Add-Todo Error:", e));
          }}
        >
          Add Todo
        </button>
      </div>
      {todos.docs.map((todo: Todo) => (
        <div key={todo._id}>
          <input
            type="radio"
            checked={selectedTodo === todo._id}
            onChange={() => {
              // console.log("selected todo", todo._id);
              setSelectedTodo(todo._id as string);
            }}
          />
          <span
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
  const { doc: todo, merge, save, reset, del } = useDocument<TodoData>({
    _id: id,
    ...DEFAULT_TODO // Use defaults for all fields to guarantee they are defined
  });
  // console.log("editing todo", todo);

  // Create a guaranteed complete todo object
  const ensureCompleteTodo = (): TodoData => ({
    text: todo.text || "",
    date: todo.date || Date.now(),
    completed: !!todo.completed,
    _id: todo._id
  });

  // Clean up when component unmounts
  useEffect(() => {
    // Return cleanup function
    return () => {
      try {
        // Reset the document to avoid pending changes when unmounting
        reset();
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };
  }, [id]); // Re-run when id changes

  return (
    <div id="todo-editor">
      <input
        type="checkbox"
        checked={!!todo.completed}
        onChange={async () => {
          try {
            // Toggle the completed state while preserving all other values
            await save({
              _id: todo._id,
              text: todo.text || "",
              date: todo.date || Date.now(),
              completed: !todo.completed
            });
          } catch (e) {
            console.error("TodoEditor toggle error:", e);
          }
        }}
      />
      <input
        type="text"
        value={todo.text || ""}
        placeholder="update todo here"
        onChange={(e) => {
          // Just update the text field
          merge({ text: e.target.value.trim() });
        }}
      />
      <button
        onClick={async () => {
          try {
            // Save a complete todo object
            await save(ensureCompleteTodo());
            if (onClose) onClose();
          } catch (e) {
            console.error("TodoEditor save error:", e);
          }
        }}
      >
        Save Changes
      </button>
      <button
        onClick={async () => {
          try {
            await del();
            if (onClose) onClose();
          } catch (e) {
            console.error("TodoEditor delete error:", e);
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}
