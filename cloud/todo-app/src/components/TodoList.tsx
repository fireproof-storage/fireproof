import React from "react";
import { FilterType, Todo } from "../types.js";
import TodoItem from "./TodoItem.js";

interface TodoListProps {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  filter: FilterType;
}

/**
 * List component for displaying todos
 */
function TodoList({ todos, onToggle, onDelete, filter }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <h3>{filter === "all" ? "No todos yet" : filter === "active" ? "No active todos" : "No completed todos"}</h3>
        <p>
          {filter === "all"
            ? "Add your first todo above!"
            : filter === "active"
              ? "All tasks completed! 🎉"
              : "Complete some todos to see them here."}
        </p>
      </div>
    );
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoItem key={todo._id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </ul>
  );
}

export default TodoList;
