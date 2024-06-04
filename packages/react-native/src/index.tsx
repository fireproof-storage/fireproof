import { StoreOpts } from '@fireproof/encrypted-blockstore';
import {
  type ConfigOpts,
  type Database,
  FireproofCtx,
  useDocument,
  useFireproof as useFireproofReact,
  useLiveQuery,
} from 'use-fireproof';

import { makeDataStore, makeMetaStore, makeRemoteWAL } from './store-native';

const store = {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL,
} as unknown as StoreOpts;

// override with a new 'useFireproof' for React Native
const useFireproof = (name?: string | Database | undefined, config?: ConfigOpts | undefined) => {
  return useFireproofReact(name, {
    ...config,
    store,
  });
};

export { FireproofCtx, useDocument, useFireproof, useLiveQuery };
