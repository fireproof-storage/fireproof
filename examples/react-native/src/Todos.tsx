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
import {fireproof, Database} from '@fireproof/react-native';
// import {Database} from '@fireproof/core';

type Todo = {
  completed?: boolean;
  text?: string;
};

const Todos = () => {
  let database: Database = fireproof('todo');

  try {
    database = fireproof('todos');
  } catch (e) {
    console.error(e);
  }

  const todos: ArrayLike<Todo> | null | undefined = []; //useLiveQuery('date', {limit: 10, descending: true}).docs;
  const [text, onChangeText] = useState<string>('test fireproof');

  const renderTodo = ({item}: ListRenderItemInfo<Todo>) => {
    return (
      <View>
        <Switch
          // onValueChange={() => null}
          value={item.completed}
        />
        <Text>{item.text as string}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View>
        <TextInput onChangeText={onChangeText} value={text} />
        <Button
          title="Add Todo"
          onPress={async () => {
            try {
              const res = await database.put({text});
              console.log({res});
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </View>
      <FlatList<Todo> data={todos} renderItem={renderTodo} />
    </View>
  );
};

export default Todos;

const styles = StyleSheet.create({
  container: {
    margin: 10,
  },
});
