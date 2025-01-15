import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFireproof } from 'use-fireproof';
import { TodoStorage } from '../types/todo';
import { getEmptyTodo } from '../utils/todoUtils';
import { DATABASE_CONFIG } from '../config/database';

export function TodoEditor() {
  const navigate = useNavigate();
  const { todoId } = useParams();
  const { useDocument } = useFireproof(DATABASE_CONFIG.name);

  const emptyWithId = getEmptyTodo(todoId!);
  const [todo, setTodo, storeTodo] = useDocument<TodoStorage>(
    () => emptyWithId
  );

  const doUpdate = async (updatedTodo: Partial<TodoStorage>) => {
    const updated = {
      ...todo,
      ...updatedTodo,
      updatedAt: new Date().toISOString(),
    };
    console.log('Updating todo to ', updated);
    setTodo(updated);
    await storeTodo(updated);
  };

  const navigateToTodos = () => {
    navigate('/');
  };

  const [last_ms, setLast] = useState(0);
  const milliseconds = performance.now();
  const elapsed = last_ms ? Math.round(milliseconds - last_ms) : 0;

  if (todo.type !== 'todo') {
    console.log(elapsed, 'Not rendering, document still loading.', todo);
    if (!last_ms) setLast(milliseconds);
  } else {
    console.log(elapsed, 'Document loaded', todo);
  }

  return (
    todo.type === 'todo' && (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              value={todo.title || ''}
              onChange={(e) => doUpdate({ title: e.target.value })}
              className="w-full p-2 border rounded-md"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={todo.description || ''}
              onChange={(e) => doUpdate({ description: e.target.value })}
              className="w-full p-2 border rounded-md h-32"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Priority
            </label>
            <select
              value={todo.priority || '2'}
              onChange={(e) =>
                doUpdate({
                  priority: e.target.value as TodoStorage['priority'],
                })
              }
              className="w-full p-2 border rounded-md"
            >
              <option value="1">High</option>
              <option value="2">Medium</option>
              <option value="3">Low</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={todo.completed || false}
                onChange={(e) => doUpdate({ completed: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Completed
              </span>
            </label>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={navigateToTodos}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 bg-blue-600 text-white hover:text-white"
            >
              Back to Todos
            </button>
          </div>
        </div>
      </div>
    )
  );
}
