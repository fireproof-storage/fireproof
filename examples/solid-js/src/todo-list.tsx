import { For, createEffect } from 'solid-js';
import { createFireproof } from '@fireproof/solid-js';

// You can have a global database that any Solid component can import
export const todoList = createFireproof('todo-list');

type Todo = { text: string; date: number; completed: boolean };

export const TodoList = () => {
  const { database, createDocument, createLiveQuery } = todoList
  const todos = createLiveQuery<Todo>('date', { limit: 10, descending: true })
  const [todo, setTodo, saveTodo] = createDocument(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  } as Todo));

  createEffect(() => {
    console.log("TODOS >>>", todos())
  })

  return (
    <>
      <div>
        <input 
          type="text" 
          value={todo().text} 
          placeholder="new todo here"
          onChange={e => setTodo({ text: e.target.value.trim() })} 
        />
        <button
          onClick={() => {
            saveTodo()
            setTodo()
          }}
        >
          Add Todo
        </button>
      </div>
      <For each={(todos().docs)}>
        {(todo) => {
          const { text, completed } = todo;
          return (
            <div>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={async () => await database().put({ ...todo, completed: !completed })}
              />
              <span
                style={{
                  'text-decoration': todo.completed ? 'line-through' : 'none',
                }}
              >
                {text}
              </span>
            </div>
          );
        }}
      </For>
    </>
  );
};
