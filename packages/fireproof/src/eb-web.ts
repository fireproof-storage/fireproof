import { StoreOpts } from '@fireproof/encrypted-blockstore'
import * as crypto from '@fireproof/encrypted-blockstore/crypto-web'
import {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL
} from '@fireproof/encrypted-blockstore/store-web'

const store = {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL
} as StoreOpts

export { store, crypto }
