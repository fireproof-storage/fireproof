import { Todo } from "../types.js";

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

/**
 * Individual todo item component
 */
function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  /**
   * Handle checkbox change
   */
  const handleToggle = () => {
    onToggle(todo);
  };

  /**
   * Handle delete button click
   */
  const handleDelete = () => {
    onDelete(todo);
  };

  return (
    <li className={`todo-item ${todo.completed ? "completed" : ""}`}>
      <input type="checkbox" className="todo-checkbox" checked={todo.completed} onChange={handleToggle} />
      <span className="todo-text">{todo.text}</span>
      <div className="todo-actions">
        <button className="delete-btn" onClick={handleDelete} title="Delete todo">
          Delete
        </button>
      </div>
    </li>
  );
}

export default TodoItem;
