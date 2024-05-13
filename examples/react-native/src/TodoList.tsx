import React, {useEffect, useState} from 'react';
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFireproof} from '@fireproof/react-native';
import { Doc } from '@fireproof/core';
import TodoItem from './TodoItem';

export type Todo = { text: string; date: number; completed: boolean; };
export type TodoFromAllDocs = { key: string; value: Doc<Todo>; };

const TodoList = () => {
  // TODO: {public: true} is there until crypto.subtle.(encrypt|decrypt) are present in RNQC
  const { database: db, useDocument } = useFireproof('TodoDB', {public: true});

  const [todos, setTodos] = useState<TodoFromAllDocs[]>([])
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  }));

  useEffect(() => {
    const getDocs = async () => {
      const res = await db.allDocs<Todo>();
      setTodos(res.rows);
    }
    getDocs()
  }, []);

  db.subscribe((changes) => {
    if (changes.length > 0) console.log({changes});
  });

  return (
    <View style={styles.container}>
      <View>
        <TextInput
          placeholder="new todo"
          onChangeText={(text) => setTodo({text})}
          value={todo.text}
        />
        <Button
          title="Add Todo"
          onPress={() => saveTodo()}
        />
      </View>
      <View>
        <Text>Todo List:</Text>
        {
          todos.map((todo, i) => (
            // @ts-expect-error `Property '_deleted' does not exist on type 'Doc<Todo>'.`
            !(todo.value._deleted) && <TodoItem key={i} item={todo} />
          ))
        }

        {/* for some reason, this is throwing the React Hooks error.  Maybe useMemo() in useFireproof? */}
        {/* <FlatList<TodoFromAllDocs>
          data={todos}
          renderItem={({item, index}) => (<TodoItem key={index} item={item} />)}
        /> */}
      </View>
    </View>
  );
};

export default TodoList;

const styles = StyleSheet.create({
  container: {
    margin: 10,
  },
});
