import { useState } from "react";
import { useFireproof } from "use-fireproof";

type Todo = Partial<{
  readonly text: string;
  readonly date: number;
  readonly completed: boolean;
}>;

export default function TodoList() {
  const { useDocument, useLiveQuery } = useFireproof("TodoDB");
  const [selectedTodo, setSelectedTodo] = useState<string>("");
  const todos = useLiveQuery<Todo>("date", { limit: 1000, descending: true });
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    text: "",
    date: Date.now(),
    completed: false,
  }));
  // console.log("todos", todo, todos.docs.length) //todos.docs.map((t) => t.text));

  return (
    <>
      <div>
        <input
          type="text"
          value={todo.text}
          placeholder="new todo here"
          onChange={(e) => {
            // console.log("setting todo", e.target.value);
            setTodo({ text: e.target.value.trim() });
          }}
        />
        <button
          onClick={() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (todo as any)._id;
            // console.log("saving todo", todo, saveTodo.toString());
            saveTodo()
              .then(() => {
                // console.log("saved todo", todo.text);
                setTodo({ text: "", _id: undefined });
              })
              .catch((e) => console.error(e));
          }}
        >
          Add Todo
        </button>
      </div>
      {todos.docs.map((todo) => (
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
            {todo.text}
          </span>
        </div>
      ))}
      {selectedTodo && <TodoEditor id={selectedTodo} />}
    </>
  );
}

interface TodoEditorProps {
  readonly id: string;
}

function TodoEditor({ id }: TodoEditorProps) {
  const { useDocument } = useFireproof("TodoDB");
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    _id: id, // showcase modifying an existing document
    text: "",
    date: Date.now(),
    completed: false,
  }));
  // console.log("editing todo", todo);

  return (
    <div id="todo-editor">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={async () => {
          // console.log("toggling todo", todo);
          await saveTodo({ ...todo, completed: !todo.completed });
          // console.log("toggling todo", todo, res);
          setTodo();
        }}
      />
      <input
        type="text"
        value={todo.text}
        placeholder="update todo here"
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
