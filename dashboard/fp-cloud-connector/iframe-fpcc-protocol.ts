import { ensureLogger } from "@fireproof/core-runtime";
import { FPCCProtocol, FPCCProtocolBase } from "./fpcc-protocol.js";
import { FPCCMessage, FPCCMsgBase, FPCCSendMessage } from "./protocol-fp-cloud-conn.js";
import { SuperThis } from "@fireproof/core-types-base";
import { Logger } from "@adviser/cement";

export class IframeFPCCProtocol implements FPCCProtocol {
  readonly sthis: SuperThis;
  readonly logger: Logger;
  readonly fpccProtocol: FPCCProtocolBase;

  constructor(sthis: SuperThis) {
    this.sthis = sthis;
    this.logger = ensureLogger(sthis, "IframeFPCCProtocol");
    this.fpccProtocol = new FPCCProtocolBase(sthis, this.logger);
  }

  readonly handleMessage = (event: MessageEvent<unknown>): void => {
    this.fpccProtocol.handleMessage(event);
  };

  readonly handleError = (_error: unknown): void => {
    throw new Error("Method not implemented.");
  };

  start(sendFn: (evt: FPCCMessage, srcEvent: MessageEvent<unknown>) => void): void {
    this.fpccProtocol.start(sendFn);
  }

  sendMessage<T extends FPCCMsgBase>(message: FPCCSendMessage<T>, srcEvent: MessageEvent<unknown>): void {
    this.fpccProtocol.sendMessage(message, srcEvent);
  }
}
