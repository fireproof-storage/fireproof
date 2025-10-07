import React from "react";

interface TodoFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/**
 * Form component for adding new todos
 */
function TodoForm({ value, onChange, onSubmit }: TodoFormProps) {
  /**
   * Handle form submission
   */
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  /**
   * Handle Enter key press
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyPress}
        placeholder="What needs to be done?"
        autoFocus
      />
      <button type="submit" disabled={!value.trim()}>
        Add Todo
      </button>
    </form>
  );
}

export default TodoForm;
