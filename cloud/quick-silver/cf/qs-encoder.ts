/// <reference types="@cloudflare/workers-types" />

import { EventoEnDecoder, Result } from "@adviser/cement";
import type { SuperThis } from "@fireproof/core-runtime";

export class QSCborEventoEnDecoder implements EventoEnDecoder<ArrayBuffer, string> {
  private readonly sthis: SuperThis;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
  }

  async encode(args: ArrayBuffer): Promise<Result<unknown>> {
    const decoded = this.sthis.ende.cbor.decodeUint8<unknown>(new Uint8Array(args));
    if (decoded.isErr()) return Result.Ok();
    return Result.Ok(decoded.Ok());
  }

  decode(data: unknown): Promise<Result<string>> {
    return Promise.resolve(Result.Ok(JSON.stringify(data)));
  }
}
