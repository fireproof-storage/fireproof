import type { URI } from "@adviser/cement";
import { SuperThis } from "../../../types.js";
import { getStore } from "../../../utils.js";

export function getPath(url: URI, sthis: SuperThis): string {
  const basePath = url.pathname;
  // .toString()
  // .replace(new RegExp(`^${url.protocol}//`), "")
  // .replace(/\?.*$/, "");
  const name = url.getParam("name");
  if (name) {
    // const urlGen = url.getParam(PARAM.URL_GEN);
    // switch (urlGen) {
    //   case "default":
    //   case "fromEnv":
    //   default:
    //     break;
    // }

    // const version = url.getParam("version");
    // if (!version) throw sthis.logger.Error().Url(url).Msg(`version not found`).AsError();
    return sthis.pathOps.join(basePath, name);
  }
  return sthis.pathOps.join(basePath);
}

export function getFileName(url: URI, sthis: SuperThis): string {
  const key = url.getParam("key");
  if (!key) throw sthis.logger.Error().Url(url).Msg(`key not found`).AsError();
  const res = getStore(url, sthis, (...a: string[]) => a.join("-"));
  switch (res.fromUrl) {
    case "file":
      return sthis.pathOps.join(res.name, key);
    case "car":
      return sthis.pathOps.join(res.name, key + ".car");
    case "wal":
    case "meta":
      return sthis.pathOps.join(res.name, key + ".json");
    default:
      throw sthis.logger.Error().Url(url).Msg(`unsupported store type`).AsError();
  }
}
