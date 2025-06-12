import { useState } from "react";
import { toCloud, useFireproof } from "use-fireproof";
import "./App.css";
import TodoFilters from "./components/TodoFilters";
import TodoForm from "./components/TodoForm";
import TodoList from "./components/TodoList";
import { FilterType, Todo } from "./types";

/**
 * Main Todo App component with Fireproof cloud sync
 */
function App() {
  const { database, attach, useLiveQuery } = useFireproof("fireproof-todo-app", {
    attach: toCloud({
      dashboardURI: "http://localhost:3000/fp/cloud/api/token",
      tokenApiURI: "http://localhost:3000/api",
      urls: { base: "fpcloud://localhost:8787?protocol=ws" },
    }),
  });

  const [filter, setFilter] = useState<FilterType>("all");
  const [newTodoText, setNewTodoText] = useState("");

  // Get all todos from Fireproof, sorted by creation time (newest last)
  const todos = useLiveQuery("_id").docs as Todo[];
  const sortedTodos = [...todos].sort((a, b) => a.createdAt - b.createdAt);

  /**
   * Add a new todo
   */
  const handleAddTodo = async () => {
    if (!newTodoText.trim()) return;

    const todo: Omit<Todo, "_id"> = {
      text: newTodoText.trim(),
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await database.put(todo);
    setNewTodoText("");
  };

  /**
   * Toggle todo completion status
   */
  const handleToggleTodo = async (todo: Todo) => {
    if (!todo._id) return;

    const updatedTodo: Todo = {
      ...todo,
      completed: !todo.completed,
      updatedAt: Date.now(),
    };

    await database.put(updatedTodo);
  };

  /**
   * Delete a todo
   */
  const handleDeleteTodo = async (todo: Todo) => {
    if (!todo._id) return;
    await database.del(todo._id);
  };

  /**
   * Handle token reset for cloud sync
   */
  const handleResetToken = () => {
    if (attach.ctx.tokenAndClaims.state === "ready") {
      attach.ctx.tokenAndClaims.reset();
    }
  };

  // Filter todos based on current filter
  const filteredTodos = sortedTodos.filter((todo) => {
    switch (filter) {
      case "active":
        return !todo.completed;
      case "completed":
        return todo.completed;
      default:
        return true;
    }
  });

  const completedCount = sortedTodos.filter((todo) => todo.completed).length;
  const activeCount = sortedTodos.length - completedCount;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔥 Fireproof Todo</h1>
      </header>

      <div className="sync-status">
        <span>
          Sync: {attach.state}
          {attach.ctx.tokenAndClaims.state === "ready" ? ` [${attach.ctx.tokenAndClaims.tokenAndClaims.token.slice(0, 8)}...]` : ""}
        </span>
        {attach.state === "error" && <span style={{ color: "#ff4757" }}>{attach.error.message}</span>}
        <button onClick={handleResetToken}>Reset Token</button>
      </div>

      <TodoForm value={newTodoText} onChange={setNewTodoText} onSubmit={handleAddTodo} />

      {sortedTodos.length > 0 && (
        <TodoFilters currentFilter={filter} onFilterChange={setFilter} activeCount={activeCount} completedCount={completedCount} />
      )}

      <TodoList todos={filteredTodos} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} filter={filter} />
    </div>
  );
}

export default App;
