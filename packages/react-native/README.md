# @fireproof/react-native

React Native bindings for Fireproof

## Installation

Add `@fireproof/react-native` dependency. We also need to add any native module dependencies so they autolink properly.

    pnpm add @fireproof/react-native react-native-quick-crypto
    pnpm pods

## Development

To develop your application, run

    pnpm start

in its root directory. Then select `i` or `a` to run iOS or Android simulators respectively. You might need to build with XCode or Android Studio at first, to properly compile the native modules.

See the `examples/react-native` app for a working code sample.

## Caveats

Until `react-native-quick-crypto` gets support for `subtle.encrypt()` and `subtle.decrypt()` for `aes`, you need to use `{public: true}` database option:

```js
const { database, useDocument } = useFireproof('TodoDB', { public: true });
```
