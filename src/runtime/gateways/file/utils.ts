import { URI } from "@adviser/cement";
import { Logger, getStore } from "../../../utils.js";
import { SysContainer } from "../../sys-container.js";

export function getPath(url: URI, logger: Logger): string {
  const basePath = url.pathname;
  // .toString()
  // .replace(new RegExp(`^${url.protocol}//`), "")
  // .replace(/\?.*$/, "");
  const name = url.getParam("name");
  if (name) {
    const version = url.getParam("version");
    if (!version) throw logger.Error().Url(url).Msg(`version not found`).AsError();
    return SysContainer.join(basePath, version, name);
  }
  return SysContainer.join(basePath);
}

export function getFileName(url: URI, logger: Logger): string {
  const key = url.getParam("key");
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

export function toArrayBuffer(buffer: Buffer | string) {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer);
  }
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return view;
}
