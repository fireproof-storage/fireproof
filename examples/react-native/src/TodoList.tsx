import React, {useState} from 'react';
import {
  Button,
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Doc, useFireproof} from '@fireproof/react-native';

export type Todo = { text: string; date: number; completed: boolean; };

const TodoList = () => {
  // TODO: {public: true} is there until crypto.subtle.(encrypt|decrypt) are present in RNQC
  const { useDocument, useLiveQuery } = useFireproof('TodoDB', {public: true});
  // const [selectedTodo, setSelectedTodo] = useState<string>("")
  const todos: Doc<Todo>[] = useLiveQuery<Todo>('date', {limit: 10, descending: true}).docs;
  console.log({todos});
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    // TODO: reset to '' after dev work
    text: 'implement mmkv as backend',
    date: Date.now(),
    completed: false,
  }));

  const TodoItem = ({item, index}) => {
    // console.log({item, index});
    return (
      <View key={index}>
        <Switch
          // onValueChange={(completed) => setTodo({completed})}
          value={item.completed}
        />
        <Text>{item.text}</Text>
      </View>
    );
};

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
            <TodoItem item={todo} index={i} />
          ))
        }
        {/* <FlatList<Todo>
          data={todos}
          renderItem={({item, index}) => {
            return (
              <View key={index}>
                <Switch
                  // onValueChange={(completed) => setTodo({completed})}
                  value={item.completed}
                />
                <Text>{item.text}</Text>
              </View>
            );
          }}
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
