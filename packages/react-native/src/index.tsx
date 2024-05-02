import { ConfigOpts, Database, useFireproof as useFireproofReact } from 'use-fireproof';
import { StoreOpts } from '@fireproof/encrypted-blockstore'
import * as crypto from '@fireproof/encrypted-blockstore/crypto-web'

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


// Fireproof React exports
export * from 'use-fireproof';

// export (override with) a new 'useFireproof' for React Native
export const useFireproof = (
  name?: string | Database | undefined,
  config?: ConfigOpts | undefined
) => {
  return useFireproofReact(name, {
    ...config,
    store,
    crypto,
  })
};

