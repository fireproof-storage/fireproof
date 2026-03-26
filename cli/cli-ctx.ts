import { SuperThis } from "@fireproof/core-types-base";
import { cmd_tsStream } from "./cmd-ts-stream.js";

export interface CliCtx {
  sthis: SuperThis;
  cliStream: ReturnType<typeof cmd_tsStream>;
}
