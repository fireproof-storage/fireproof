/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import {SafeAreaView, StatusBar, useColorScheme, View} from 'react-native';
// import {Colors, Header} from 'react-native/Libraries/NewAppScreen';
import Todos from './Todos';

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';
  // const backgroundStyle = {
  //   backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  // };

  return (
    <SafeAreaView>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View>
        <Todos />
      </View>
    </SafeAreaView>
  );
};

export default App;
