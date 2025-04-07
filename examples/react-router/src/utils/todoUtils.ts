import { TodoStorage } from "../types/todo";

export const getEmptyTodo = (id?: string): TodoStorage => ({
  _id: id,
  title: "",
  description: "",
  priority: "medium",
  completed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  type: "empty",
});
