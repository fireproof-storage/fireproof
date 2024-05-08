import React, {useEffect, useState} from 'react';
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
import {useFireproof} from '@fireproof/react-native';

export type Todo = { text: string; date: number; completed: boolean; };

const TodoList = () => {
  // TODO: {public: true} is there until crypto.subtle.(encrypt|decrypt) are present in RNQC
  const { database, useDocument } = useFireproof('TodoDB', {public: true});

  const [todos, setTodos] = useState<Todo[]>([])

  useEffect(() => {
    const getDocs = async () => {
      const res = await database.allDocs<Todo>();
      setTodos(res.rows);
    }
    getDocs()
  }, []);

  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    text: '',
    date: Date.now(),
    completed: false,
  }));

  const TodoItem = ({item}) => {
    // console.log({item});
    if (!item?.value) return null;
    return (
      <View style={styles.itemRow}>
        <Switch
          // onValueChange={(completed) => setTodo({completed})}
          value={item.value.completed}
        />
        <Text>{item.value.text}</Text>
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
            <TodoItem key={i} item={todo} />
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
