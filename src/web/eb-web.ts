import { StoreOpts } from "../storage-engine";
import * as crypto from "./crypto-web";
import { makeDataStore, makeMetaStore, makeRemoteWAL } from "../web/store-web";

const store: StoreOpts = {
  makeDataStore,
  makeMetaStore,
  makeRemoteWAL,
};

export { store, crypto };
