import React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { TodoStorage } from "../types/todo";

interface TodoCardProps {
  todo: TodoStorage;
}

const priorityColors = {
  high: "bg-red-100 border-red-200",
  medium: "bg-yellow-100 border-yellow-200",
  low: "bg-green-100 border-green-200",
};

export function TodoCard({ todo }: TodoCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/edit/${todo._id}`)}
      className={`w-full text-left p-4 rounded-lg border-2 ${priorityColors[todo.priority]} hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{todo.title}</h3>
        {todo.completed ? <CheckCircle2 className="text-green-600" /> : <Circle className="text-gray-400" />}
      </div>
      <p className="text-gray-600 line-clamp-2">{todo.description}</p>
    </button>
  );
}
