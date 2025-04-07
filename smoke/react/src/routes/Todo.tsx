import { useState } from "react";
// In the smoke tests, use-fireproof is available as a package name
// This works because of how the smoke test environment is set up
import { useFireproof } from "use-fireproof";

type Todo = Partial<{
  readonly text: string;
  readonly date: number;
  readonly completed: boolean;
}>;

export default function TodoList() {
  const { database, useDocument, useLiveQuery } = useFireproof("TodoDB");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const todos = useLiveQuery<Todo>("date", { limit: 1000, descending: true });
  const [newTodo, setNewTodo, saveNewTodo] = useDocument<Todo>({
    text: "",
    date: Date.now(),
    completed: false,
  });

  // Handle the editing of existing todos
  const { doc: editingTodo, merge, submit } = useDocument<Todo>(
    editingTodoId ? { _id: editingTodoId } : null
  );

  const handleToggleComplete = async (todo: Todo & { _id: string }) => {
    await database.put({
      ...todo,
      completed: !todo.completed,
    });
  };

  const handleAddTodo = async () => {
    if (!newTodo.text) return;
    
    try {
      await saveNewTodo();
      setNewTodo({ text: "", date: Date.now(), completed: false });
    } catch (e) {
      console.error("Add-Todo Error:", e);
    }
  };

  const handleEditClick = (todoId: string) => {
    setEditingTodoId(todoId);
  };

  const handleCancelEdit = () => {
    setEditingTodoId(null);
  };

  const handleSaveEdit = async () => {
    await submit();
    setEditingTodoId(null);
  };

  const handleDeleteTodo = async (todoId: string) => {
    await database.remove(todoId);
    if (editingTodoId === todoId) {
      setEditingTodoId(null);
    }
  };

  return (
    <>
      <div className="todo-form">
        <input
          type="text"
          value={newTodo.text || ""}
          placeholder="Add a new todo"
          onChange={(e) => setNewTodo({ text: e.target.value.trim() })}
          onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
        />
        <button onClick={handleAddTodo}>Add Todo</button>
      </div>

      <div className="todo-list">
        {todos.docs.map((todo: Todo & { _id: string }) => (
          <div key={todo._id} className="todo-item">
            {editingTodoId === todo._id ? (
              // Edit mode
              <div className="todo-edit-form">
                <input
                  type="text"
                  value={editingTodo.text || ""}
                  onChange={(e) => merge({ text: e.target.value.trim() })}
                />
                <input
                  type="checkbox"
                  checked={editingTodo.completed || false}
                  onChange={() => merge({ completed: !editingTodo.completed })}
                />
                <button onClick={handleSaveEdit}>Save</button>
                <button onClick={handleCancelEdit}>Cancel</button>
                <button onClick={() => handleDeleteTodo(todo._id as string)}>Delete</button>
              </div>
            ) : (
              // View mode
              <>
                <input
                  type="checkbox"
                  checked={todo.completed || false}
                  onChange={() => handleToggleComplete(todo as Todo & { _id: string })}
                />
                <span
                  style={{
                    textDecoration: todo.completed ? "line-through" : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => handleEditClick(todo._id as string)}
                >
                  {todo.text}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
