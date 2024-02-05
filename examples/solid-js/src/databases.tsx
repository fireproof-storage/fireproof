import { createFireproof } from "@fireproof/solid-js";

// You can have a global database that any component can import in Solid
export const TodoListDB = createFireproof('TodoListDB');
