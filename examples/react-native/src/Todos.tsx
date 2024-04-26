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
import {useFireproof} from '@fireproof/react-native';
// import {type Database} from '@fireproof/react-native';

type Todo = { text: string; date: number; completed: boolean; };

const Todos = () => {
  const { useDocument, useLiveQuery } = useFireproof('TodoDB');
  const [selectedTodo, setSelectedTodo] = useState<string>("")
  const todos = useLiveQuery<Todo>('date', {limit: 10, descending: true});
  const [todo, setTodo, saveTodo] = useDocument<Todo>(() => ({
    text: "",
    date: Date.now(),
    completed: false,
  }));

  const renderTodo = ({item}: ListRenderItemInfo<Todo>) => {
    return (
      <View>
        <Switch
          // onValueChange={() => null}
          value={item.completed}
        />
        <Text>{item.text}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View>
        <TextInput onChangeText={(text) => setTodo({text})} value={todo.text} />
        <Button
          title="Add Todo"
          onPress={async () => {
            try {
              const res = await saveTodo();
              console.log({res});
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </View>
      <View>
        <Text>Todos:</Text>
        <FlatList<Todo> data={todos.docs} renderItem={renderTodo} />
      </View>
    </View>
  );
};

export default Todos;

const styles = StyleSheet.create({
  container: {
    margin: 10,
  },
});
