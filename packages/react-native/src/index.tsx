import {
  type ConfigOpts,
  type Database,
  useFireproof as useFireproofReact,
  useDocument,
  useLiveQuery,
  FireproofCtx
} from 'use-fireproof';
import { StoreOpts } from '@fireproof/encrypted-blockstore'

import {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL
} from './store-native'

const store = {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL
} as unknown as StoreOpts

// override with a new 'useFireproof' for React Native
const useFireproof = (
  name?: string | Database | undefined,
  config?: ConfigOpts | undefined
) => {
  return useFireproofReact(name, {
    ...config,
    store,
  })
};

export {
  useFireproof,
  useDocument,
  useLiveQuery,
  FireproofCtx,
};
