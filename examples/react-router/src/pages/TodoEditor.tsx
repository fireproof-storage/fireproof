import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFireproof } from "use-fireproof";
import { TodoStorage } from "../types/todo";
import { getEmptyTodo } from "../utils/todoUtils";
import { DATABASE_CONFIG } from "../config/database";

export function TodoEditor() {
  const navigate = useNavigate();
  const { todoId } = useParams();
  const { useDocument } = useFireproof(DATABASE_CONFIG.name);
  const [last_ms, setLast] = useState(0);
  const emptyWithId = getEmptyTodo(todoId || "");
  const { doc, merge, submit } = useDocument<TodoStorage>(() => emptyWithId);

  if (!todoId) {
    navigate("/");
    return null;
  }

  const doUpdate = async (updatedTodo: Partial<TodoStorage>) => {
    try {
      const updated = {
        ...updatedTodo,
        updatedAt: new Date().toISOString(),
      };
      console.log("Updating todo to ", updated);
      await merge(updated);
    } catch (err) {
      console.error("Failed to save", err);
    }
  };

  const navigateToTodos = () => {
    navigate("/");
  };

  const milliseconds = performance.now();
  const elapsed = last_ms ? Math.round(milliseconds - last_ms) : 0;

  if (doc.type !== "todo") {
    console.log(elapsed, "Not rendering, document still loading.", doc);
    if (!last_ms) setLast(milliseconds);
  } else {
    console.log(elapsed, "Document loaded", doc);
  }

  return (
    doc.type === "todo" && (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input
              type="text"
              value={doc.title || ""}
              onChange={(e) => doUpdate({ title: e.target.value })}
              className="w-full p-2 border rounded-md"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={doc.description || ""}
              onChange={(e) => doUpdate({ description: e.target.value })}
              className="w-full p-2 border rounded-md h-32"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={doc.priority || "medium"}
              onChange={(e) =>
                doUpdate({
                  priority: e.target.value as TodoStorage["priority"],
                })
              }
              className="w-full p-2 border rounded-md"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={doc.completed || false}
                onChange={(e) => doUpdate({ completed: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Completed</span>
            </label>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={navigateToTodos}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await submit();
                navigateToTodos();
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  );
}
