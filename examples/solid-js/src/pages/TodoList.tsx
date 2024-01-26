import { For } from 'solid-js';
import { TodoListDB } from '../databases';
import { Todo } from '../types';

export default function TodoList() {
  const todos = TodoListDB.createLiveQuery<Todo>('date', { limit: 10, descending: true })
  const [todo, setTodo, saveTodo] = TodoListDB.createDocument<Todo>(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  }));

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
                type="checkbox"
                checked={todo.completed}
                onChange={async () => await saveTodo({ ...todo, completed: !todo.completed })}
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
    </>
  );
};
