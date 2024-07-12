import { Logger, getStore } from "../utils.js";
import { SysContainer } from "./sys-container.js";

export async function getPath(url: URL, logger: Logger): Promise<string> {
  const basePath = url
    .toString()
    .replace(new RegExp(`^${url.protocol}//`), "")
    .replace(/\?.*$/, "");
  const name = url.searchParams.get("name");
  if (name) {
    const version = url.searchParams.get("version");
    if (!version) throw logger.Error().Str("url", url.toString()).Msg(`version not found`).AsError();
    return SysContainer.join(basePath, version, name);
  }
  return SysContainer.join(basePath);
}

export function getFileName(url: URL, key: string, logger: Logger): string {
  switch (getStore(url, logger, (...a: string[]) => a.join("/"))) {
    case "data":
      return key + ".car";
    case "meta":
      return key + ".json";
    default:
      throw logger.Error().Str("url", url.toString()).Msg(`unsupported store type`).AsError();
  }
}

export function ensureIndexName(url: URL, name: string): string {
  if (url.searchParams.has("index")) {
    name = (url.searchParams.get("index")?.replace(/[^a-zA-Z0-9]/g, "") || "idx") + "-" + name;
  }
  return name;
}
