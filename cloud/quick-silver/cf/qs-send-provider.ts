/// <reference types="@cloudflare/workers-types" />

import { EventoSendProvider, HandleTriggerCtx, Result } from "@adviser/cement";
import type { SuperThis } from "@fireproof/core-types-base";
import type { QSOpRes } from "@fireproof/cloud-quick-silver-types";

export class QSSendProvider implements EventoSendProvider<ArrayBuffer, unknown, unknown> {
  readonly ws: WebSocket;
  private readonly sthis: SuperThis;

  constructor(ws: WebSocket, sthis: SuperThis) {
    this.ws = ws;
    this.sthis = sthis;
  }

  async send<T>(_ctx: HandleTriggerCtx<ArrayBuffer, unknown, unknown>, res: unknown): Promise<Result<T>> {
    this.ws.send(this.sthis.ende.cbor.encodeToUint8(res as QSOpRes));
    return Result.Ok(res as T);
  }
}
