import { Logger, getStore } from "../utils.js";
import { SysContainer } from "./sys-container.js";

export function getPath(url: URL, logger: Logger): string {
  const basePath = url
    .toString()
    .replace(new RegExp(`^${url.protocol}//`), "")
    .replace(/\?.*$/, "");
  const name = url.searchParams.get("name");
  if (name) {
    const version = url.searchParams.get("version");
    if (!version) throw logger.Error().Url(url).Msg(`version not found`).AsError();
    return SysContainer.join(basePath, version, name);
  }
  return SysContainer.join(basePath);
}

export function getFileName(url: URL, logger: Logger): string {
  const key = url.searchParams.get("key");
  if (!key) throw logger.Error().Url(url).Msg(`key not found`).AsError();
  const res = getStore(url, logger, (...a: string[]) => a.join("-"));
  switch (res.store) {
    case "data":
      return SysContainer.join(res.name, key + ".car");
    case "wal":
    case "meta":
      return SysContainer.join(res.name, key + ".json");
    default:
      throw logger.Error().Url(url).Msg(`unsupported store type`).AsError();
  }
}
