# React Native Fireproof Example

## Create a new app from template (yarn attempt)

### For local development

To handle changes in local monorepo packages, use [yalc](https://github.com/wclr/yalc) - when the package dependencies nest together, use [zalc](https://github.com/Venryx/zalc).  Install them globally, not in the repo.

    cd ./packages/fireproof
    yarn install
    zalc publish

    cd ./packages/react
    yarn install
    zalc publish

### Create React Native App
See (https://reactnative.dev/docs/environment-setup)[https://reactnative.dev/docs/environment-setup].

    yarn react-native@latest init fireproof
    zalc add @fireproof/core
    yarn install
    cd ios
    pod install
    cd ..
    

## Create a new app from template (pnpm attempt)

See (https://reactnative.dev/docs/environment-setup)[https://reactnative.dev/docs/environment-setup] but replace `yarn` with `pnpm`.

    pnpx react-native@latest init fireproof

You would think this uses `pnpm` the whole way.  It doesn't.  So we need to un-`yarn`-ify things.

    rm -rf android/.gradle/ android/app/build android/local.properties ios/Pods/ ios/Podfile.lock ios/build/ node_modules/
    rm yarn.lock

    ❯ cat .npmrc
    public-hoist-pattern[]=*eslint*
    public-hoist-pattern[]=*prettier*
    public-hoist-pattern[]=*react-native*
    public-hoist-pattern[]=*metro*

    pnpm add -D open @react-native-community/cli-platform-ios @react-native-community/cli-platform-android
    pnpm install

    cd ios
    pod install
    cd ..


## Add Fireproof

    pnpm add use-fireproof @fireproof/core

> Note: the use of `react-native-mmkv-storage ^0.9.0` means that we need to use React Native 0.71.0 and above.  Older versions of RN can use 0.8.x.

