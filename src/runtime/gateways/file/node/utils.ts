import type { URI } from "@adviser/cement";
import { getStore } from "@fireproof/core";
import type { SuperThis } from "@fireproof/core";

export function getPath(url: URI, sthis: SuperThis): string {
  const basePath = url.pathname;
  // .toString()
  // .replace(new RegExp(`^${url.protocol}//`), "")
  // .replace(/\?.*$/, "");
  const name = url.getParam(PARAM.NAME);
  if (name) {
    // const version = url.getParam(PARAM.VERSION);
    // if (!version) throw sthis.logger.Error().Url(url).Msg(`version not found`).AsError();
    // if (!url.hasParam(PARAM.URL_GEN) || url.getParam(PARAM.URL_GEN) === "default") {
    return sthis.pathOps.join(basePath, name);
    // }
    // return sthis.pathOps.join(basePath, version, name);
  }
  return sthis.pathOps.join(basePath);
}

export function getFileName(url: URI, sthis: SuperThis): string {
  const key = url.getParam(PARAM.KEY);
  if (!key) throw sthis.logger.Error().Url(url).Msg(`key not found`).AsError();
  const res = getStore(url, sthis, (...a: string[]) => a.join("-"));
  switch (res.store) {
    case "data": {
      // if (!url.hasParam(PARAM.SUFFIX)) {
      //   throw sthis.logger.Error().Url(url).Msg(`unsupported suffix`).AsError();
      // }
      return sthis.pathOps.join(res.name, key + (url.getParam(PARAM.SUFFIX) || ""));
    }
    case "wal":
    case "meta":
      return sthis.pathOps.join(res.name, key + ".json");
    default:
      throw sthis.logger.Error().Url(url).Msg(`unsupported store type`).AsError();
  }
}
