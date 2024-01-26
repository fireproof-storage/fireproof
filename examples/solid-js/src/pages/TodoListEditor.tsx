import { For, Show, createSignal, onCleanup } from 'solid-js';
import { TodoListDB } from '../databases';
import { Todo } from '../types';

const [selectedTodo, setSelectedTodo] = createSignal("")

export default function TodoListEditor() {
  const todos = TodoListDB.createLiveQuery<Todo>('date', { limit: 10, descending: true })
  const [todo, setTodo, saveTodo] = TodoListDB.createDocument<Todo>(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  }));

  onCleanup(() => {
    setSelectedTodo('')
  })

  return (
    <>
      <div>
        <input 
          type="text" 
          value={todo().text} 
          placeholder="new todo here"
          onChange={e => {
            setTodo({ text: e.target.value.trim() })
          }} 
        />
        <button
          onClick={async () => {
            await saveTodo()
            setTodo()
          }}
        >
          Add Todo
        </button>
      </div>
      <For each={(todos().docs)}>
        {(todo) => {
          return (
            <div>
              <input
                type="radio"
                checked={selectedTodo() === todo._id}
                onChange={() => setSelectedTodo(todo._id as string)}
              />
              <span
                style={{
                  'text-decoration': todo.completed ? 'line-through' : 'none',
                }}
              >
                {todo.text}
              </span>
            </div>
          );
        }}
      </For>
      <Show when={selectedTodo()} fallback={null}>
        <TodoEditor />
      </Show>
    </>
  );
};

function TodoEditor() {
  const [todo, setTodo, saveTodo] = TodoListDB.createDocument<Todo>(() => ({
    // Showcase modifying an existing document
    // SolidJS reactivity will automatically update the target document when the id changes
    _id: selectedTodo(),
    text: '',
    date: Date.now(),
    completed: false,
  }));

  return (
    <div id='todo-editor'>
      <input
        type="checkbox"
        checked={todo().completed}
        onChange={async () => setTodo({ ...todo(), completed: !todo().completed })}
      />
      <input
        type="text" 
        value={todo().text} 
        placeholder="new todo here"
        onChange={e => {
          setTodo({ text: e.target.value.trim() })
        }}
      />
      <button
        onClick={async () => {
          await saveTodo()
        }}
      >
        Save Changes
      </button>
    </div>
  );
}
