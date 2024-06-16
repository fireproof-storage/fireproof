import { useState } from "react";
import { useFireproof } from "use-fireproof";

type Todo = { text: string; date: number; completed: boolean };

export default function TodoList() {
  const { useDocument, useLiveQuery } = useFireproof("TodoDB");
  const [selectedTodo, setSelectedTodo] = useState<string>("");
  const todos = useLiveQuery<Todo>("date", { limit: 10, descending: true });
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    text: "",
    date: Date.now(),
    completed: false,
  }));

  return (
    <>
      <div>
        <input
          type="text"
          value={todo.text}
          placeholder="new todo here"
          onChange={(e) => {
            setTodo({ text: e.target.value.trim() });
          }}
        />
        <button
          onClick={async () => {
            await saveTodo();
            setTodo();
          }}
        >
          Add Todo
        </button>
      </div>
      {todos.docs.map((todo) => (
        <div key={todo._id}>
          <input type="radio" checked={selectedTodo === todo._id} onChange={() => setSelectedTodo(todo._id as string)} />
          <span
            style={{
              textDecoration: todo.completed ? "line-through" : "none",
            }}
          >
            {todo.text}
          </span>
        </div>
      ))}
      {selectedTodo && <TodoEditor id={selectedTodo} />}
    </>
  );
}

type TodoEditorProps = {
  readonly id: string;
};

function TodoEditor({ id }: TodoEditorProps) {
  const { useDocument } = useFireproof("TodoDB");
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    _id: id, // showcase modifying an existing document
    text: "",
    date: Date.now(),
    completed: false,
  }));

  return (
    <div id="todo-editor">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={async () => await saveTodo({ ...todo, completed: !todo.completed })}
      />
      <input
        type="text"
        value={todo.text}
        placeholder="new todo here"
        onChange={(e) => {
          setTodo({ text: e.target.value.trim() });
        }}
      />
      <button
        onClick={async () => {
          await saveTodo();
          setTodo();
        }}
      >
        Save Changes
      </button>
    </div>
  );
}
