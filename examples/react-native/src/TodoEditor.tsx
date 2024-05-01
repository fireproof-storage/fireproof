import { useDocument, useFireproof } from "@fireproof/react-native";
import { Todo } from "./TodoList";

type TodoEditorProps = {
  readonly id: string;
}

const TodoEditor = ({ id }: TodoEditorProps) => {
  // TODO: {public: true} is there until crypto.subtle.(encrypt|decrypt) are present in RNQC
  const { useDocument } = useFireproof('TodoDB', {public: true});
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    _id: id,
    // TODO: after dev, set text to empty string ''
    text: 'thoroughly test Fireproof with React Native',
    date: Date.now(),
    completed: false,
  }));


};

export default TodoEditor;
