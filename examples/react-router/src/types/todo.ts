export interface TodoStorage {
  _id?: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  type: "todo" | "empty";
}
