import { SuperThis } from "@fireproof/core-types-base";
import { createCliStream } from "./create-cli-stream.js";

export interface CliCtx {
  sthis: SuperThis;
  cliStream: ReturnType<typeof createCliStream>;
}
