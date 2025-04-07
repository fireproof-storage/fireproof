import { useNavigate } from "react-router-dom";
import { PlusCircle } from "lucide-react";
import { useFireproof } from "use-fireproof";
import { TodoStorage } from "../types/todo";
import { TodoCard } from "../components/TodoCard";
import { DATABASE_CONFIG } from "../config/database";
import { getEmptyTodo } from "../utils/todoUtils";

export function Home() {
  const navigate = useNavigate();
  const { database, useLiveQuery } = useFireproof(DATABASE_CONFIG.name);
  const empty = getEmptyTodo();

  const { docs: todos } = useLiveQuery<TodoStorage>("type");
  console.log("All todos", todos);

  const groupedTodos = todos.reduce(
    (acc, todo) => {
      if (!acc[todo.priority]) {
        acc[todo.priority] = [];
      }
      acc[todo.priority].push(todo);
      return acc;
    },
    {} as Record<string, TodoStorage[]>,
  );

  const createTodo = async () => {
    const newTodo: TodoStorage = {
      ...empty,
      type: "todo",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const result = await database.put(newTodo);
    console.log("Created new todo: ", newTodo, "with id of", result);
    navigate(`/edit/${result.id}`);
  };

  const mapping = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Todo Manager</h1>

        {Object.entries(mapping).map(([priority, label]) => (
          <div key={priority} className="mb-8">
            <h2 className="text-xl font-semibold capitalize mb-4">{label} Priority</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedTodos[priority]?.map((todo) => <TodoCard key={todo._id} todo={todo} />)}
            </div>
          </div>
        ))}

        <button
          onClick={createTodo}
          className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={24} />
        </button>
      </div>
    </div>
  );
}
