function gthis() {
  return globalThis;
}

gthis()[Symbol.for("FP_PRESET_ENV")] = {
  //	FP_DEBUG: "DataStoreImpl,MetaStoreImpl,IndexDBGateway"
};
